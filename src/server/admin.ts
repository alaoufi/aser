import { compareRegions } from "../lib/regions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { getCategories, getCities } from "./catalog";
import { HttpError } from "./security";

export function assertAdmin(user: SessionUser) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الإدارة");
}
export const categorySchema = z.object({
  id: z.string().min(1).max(30).optional(),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "الرابط المختصر أحرف إنجليزية صغيرة وأرقام وشرطات فقط",
    ),
  icon: z.string().trim().min(1).max(20),
});
export const locationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("region"),
    name: z.string().trim().min(2).max(120),
  }),
  z.object({
    kind: z.literal("city"),
    name: z.string().trim().min(2).max(120),
    regionId: z.string().min(1).max(50),
  }),
  z.object({
    kind: z.literal("neighborhood"),
    name: z.string().trim().min(2).max(120),
    cityId: z.string().min(1).max(50),
  }),
]);
export const moderationSchema = z
  .object({
    id: z.uuid(),
    visible: z.boolean().optional(),
    featured: z.boolean().optional(),
    categoryIds: z.array(z.string().min(1).max(30)).min(1).max(100).optional(),
    reason: z.string().trim().min(5).max(2000),
  })
  .refine(
    (v) =>
      v.visible !== undefined ||
      v.featured !== undefined ||
      v.categoryIds !== undefined,
    { message: "حدد التعديل المطلوب" },
  );
export const reportSchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "reviewing", "resolved", "dismissed"]),
  reason: z.string().trim().min(5).max(2000),
});
async function audit(
  client: PoolClient,
  user: SessionUser,
  action: string,
  targetId: string | null,
  details: unknown,
) {
  await client.query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), user.id, action, targetId, JSON.stringify(details)],
  );
}
export async function adminProducts(user: SessionUser) {
  assertAdmin(user);
  return (
    await db().query(
      `SELECT x.id,x.name,x.status,x.visible,x.featured,x.producer_id AS "producerId",p.name AS "producerName",c.name AS "cityName",p.status AS "producerStatus",ARRAY(SELECT category_id FROM jdatna.product_categories WHERE product_id=x.id) AS "categoryIds" FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id JOIN jdatna.cities c ON c.id=p.city_id ORDER BY x.created_at DESC LIMIT 200`,
    )
  ).rows;
}
export async function moderateProduct(user: SessionUser, input: unknown) {
  assertAdmin(user);
  const value = moderationSchema.parse(input);
  return transaction(async (client) => {
    const product = (
      await client.query(
        "SELECT id FROM jdatna.products WHERE id=$1 FOR UPDATE",
        [value.id],
      )
    ).rows[0];
    if (!product) throw new HttpError(404, "المنتج غير موجود");
    await client.query(
      "UPDATE jdatna.products SET visible=COALESCE($2,visible),featured=COALESCE($3,featured),updated_at=now() WHERE id=$1",
      [value.id, value.visible ?? null, value.featured ?? null],
    );
    if (value.categoryIds) {
      await client.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=$1",
        [value.id],
      );
      for (const category of new Set(value.categoryIds))
        await client.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [value.id, category],
        );
    }
    await audit(client, user, "product.moderate", value.id, value);
    return { ok: true };
  });
}
export async function adminCategories(user: SessionUser) {
  assertAdmin(user);
  return getCategories();
}
export async function saveCategory(
  user: SessionUser,
  input: unknown,
  editing: boolean,
) {
  assertAdmin(user);
  const value = categorySchema.parse(input);
  if (editing && !value.id) throw new HttpError(400, "معرف التصنيف مطلوب");
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.category.ids'))",
    );
    let id = value.id;
    if (editing) {
      const result = await client.query(
        "UPDATE jdatna.categories SET name=$2,slug=$3,icon=$4 WHERE id=$1 RETURNING id",
        [id, value.name, value.slug, value.icon],
      );
      if (!result.rowCount) throw new HttpError(404, "التصنيف غير موجود");
    } else {
      id = (
        await client.query(
          "SELECT (COALESCE(max(id::bigint),0)+1)::text AS id FROM jdatna.categories WHERE id~'^[0-9]+$'",
        )
      ).rows[0].id;
      await client.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,$2,$3,$4)",
        [id, value.name, value.slug, value.icon],
      );
    }
    await audit(
      client,
      user,
      editing ? "category.update" : "category.create",
      null,
      { ...value, id },
    );
    return { id: id! };
  });
}
export async function adminLocations(user: SessionUser) {
  assertAdmin(user);
  const [regions, cities, neighborhoods] = await Promise.all([
    db().query("SELECT id,name FROM jdatna.regions ORDER BY name LIMIT 100"),
    getCities(),
    db().query(
      'SELECT id,name,city_id AS "cityId" FROM jdatna.neighborhoods ORDER BY name LIMIT 1000',
    ),
  ]);
  return {
    regions: regions.rows.sort(compareRegions),
    cities,
    neighborhoods: neighborhoods.rows,
  };
}
export async function createLocation(user: SessionUser, input: unknown) {
  assertAdmin(user);
  const value = locationSchema.parse(input);
  return transaction(async (client) => {
    const id = randomUUID();
    if (value.kind === "region")
      await client.query("INSERT INTO jdatna.regions(id,name) VALUES($1,$2)", [
        id,
        value.name,
      ]);
    if (value.kind === "city")
      await client.query(
        "INSERT INTO jdatna.cities(id,name,region_id) VALUES($1,$2,$3)",
        [id, value.name, value.regionId],
      );
    if (value.kind === "neighborhood")
      await client.query(
        "INSERT INTO jdatna.neighborhoods(id,name,city_id) VALUES($1,$2,$3)",
        [id, value.name, value.cityId],
      );
    await audit(client, user, "location.create", null, { ...value, id });
    return { id };
  });
}
export async function adminReports(user: SessionUser) {
  assertAdmin(user);
  return (
    await db().query(
      `SELECT r.id,r.product_id AS "productId",r.producer_id AS "producerId",x.name AS "productName",p.name AS "producerName",r.reason,r.status,r.resolution_reason AS "reviewReason",r.created_at AS "createdAt" FROM jdatna.reports r LEFT JOIN jdatna.products x ON x.id=r.product_id LEFT JOIN jdatna.producer_profiles p ON p.id=COALESCE(r.producer_id,x.producer_id) ORDER BY r.created_at DESC LIMIT 200`,
    )
  ).rows;
}
export async function resolveReport(user: SessionUser, input: unknown) {
  assertAdmin(user);
  const value = reportSchema.parse(input);
  return transaction(async (client) => {
    const result = await client.query(
      "UPDATE jdatna.reports SET status=$2,resolution_reason=$3,resolved_by=$4,updated_at=now() WHERE id=$1 RETURNING id",
      [value.id, value.status, value.reason, user.id],
    );
    if (!result.rowCount) throw new HttpError(404, "البلاغ غير موجود");
    await audit(client, user, "report.update", value.id, value);
    return { ok: true };
  });
}
