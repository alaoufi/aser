import { compareRegions } from "../lib/regions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { getCategories, getCities } from "./catalog";
import { HttpError } from "./security";
import { canReparentCategory } from "../lib/category-label";
import { can, isManager, type AdminPermission } from "../lib/permissions";
import type { Category } from "../lib/types";

/** المدير الكامل، أو مشرف يملك الصلاحية المطلوبة (بدونها: أي مشرف). */
export function assertAdmin(user: SessionUser, permission?: AdminPermission) {
  if (permission ? !can(user, permission) : !isManager(user))
    throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
    )
    // يُنشأ داخليًا من رقم القسم إن لم يُرسل، ولا يُعرض في الإدارة.
    .optional(),
  icon: z.string().trim().min(1).max(20),
  parentId: z.string().min(1).max(30).nullable().optional(),
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
  assertAdmin(user, "products");
  return (
    await db().query(
      `SELECT x.id,x.name,x.status,x.visible,x.hidden_by AS "hiddenBy",x.featured,x.producer_id AS "producerId",p.name AS "producerName",c.name AS "cityName",p.status AS "producerStatus",ARRAY(SELECT category_id FROM jdatna.product_categories WHERE product_id=x.id) AS "categoryIds" FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id JOIN jdatna.cities c ON c.id=p.city_id WHERE x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 200`,
    )
  ).rows;
}
export async function moderateProduct(user: SessionUser, input: unknown) {
  assertAdmin(user, "products");
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
      // إخفاء الإدارة يُنسب لها، فلا تلغيه الأسرة.
      `UPDATE jdatna.products SET visible=COALESCE($2,visible),
         hidden_by=CASE WHEN $2::boolean IS NULL THEN hidden_by WHEN $2 THEN NULL ELSE 'admin' END,
         featured=COALESCE($3,featured),updated_at=now() WHERE id=$1`,
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
export type AdminCategory = Category & {
  productCount: number;
  childCount: number;
  familyCount: number;
};
export async function adminCategories(
  user: SessionUser,
): Promise<AdminCategory[]> {
  assertAdmin(user, "categories");
  const categories = await getCategories(true);
  const counts = new Map(
    (
      await db().query(
        `SELECT c.id,
          (SELECT count(*)::int FROM jdatna.product_categories x WHERE x.category_id=c.id) AS "productCount",
          (SELECT count(*)::int FROM jdatna.categories k WHERE k.parent_id=c.id) AS "childCount",
          (SELECT count(*)::int FROM jdatna.producer_categories f WHERE f.category_id=c.id) AS "familyCount"
        FROM jdatna.categories c`,
      )
    ).rows.map((r) => [r.id as string, r]),
  );
  return categories.map((c) => ({
    ...c,
    productCount: counts.get(c.id)?.productCount ?? 0,
    childCount: counts.get(c.id)?.childCount ?? 0,
    familyCount: counts.get(c.id)?.familyCount ?? 0,
  }));
}
/** يحذف قسمًا فقط إذا لم يبقَ له منتجات ولا أقسام فرعية؛ واختيارات الأسر له تُزال معه. */
export async function deleteCategory(user: SessionUser, input: unknown) {
  assertAdmin(user, "categories");
  const { id } = z.object({ id: z.string().min(1).max(30) }).parse(input);
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.category.ids'))",
    );
    const row = (
      await client.query(
        "SELECT id,name FROM jdatna.categories WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "القسم غير موجود");
    const products = Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM jdatna.product_categories WHERE category_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    if (products)
      throw new HttpError(
        409,
        `لا يمكن حذف «${row.name}» قبل حذف منتجاته أو نقلها لقسم آخر (${products} منتج).`,
      );
    const children = Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM jdatna.categories WHERE parent_id=$1",
          [id],
        )
      ).rows[0].n,
    );
    if (children)
      throw new HttpError(
        409,
        `لا يمكن حذف «${row.name}» وتحته ${children} قسم فرعي؛ احذفها أو انقلها أولًا.`,
      );
    const families = (
      await client.query(
        "DELETE FROM jdatna.producer_categories WHERE category_id=$1",
        [id],
      )
    ).rowCount;
    await client.query("DELETE FROM jdatna.categories WHERE id=$1", [id]);
    await audit(client, user, "category.delete", null, {
      id,
      name: row.name,
      familyLinksRemoved: families,
    });
    return { ok: true, familyLinksRemoved: families };
  });
}
export async function saveCategory(
  user: SessionUser,
  input: unknown,
  editing: boolean,
) {
  assertAdmin(user, "categories");
  const value = categorySchema.parse(input);
  if (editing && !value.id) throw new HttpError(400, "معرف التصنيف مطلوب");
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.category.ids'))",
    );
    let id = value.id;
    if (value.parentId !== undefined) {
      const all = (
        await client.query(
          'SELECT id,parent_id AS "parentId" FROM jdatna.categories',
        )
      ).rows as Category[];
      if (!canReparentCategory(all, editing ? id : undefined, value.parentId))
        throw new HttpError(
          400,
          "اختر قسمًا أبًا قائمًا دون دورة وبحد أقصى ثمانية مستويات",
        );
    }
    if (editing) {
      const result = await client.query(
        "UPDATE jdatna.categories SET name=$2,slug=COALESCE($3,slug),icon=$4,parent_id=CASE WHEN $6 THEN $5 ELSE parent_id END WHERE id=$1 RETURNING id",
        [
          id,
          value.name,
          value.slug ?? null,
          value.icon,
          value.parentId ?? null,
          value.parentId !== undefined,
        ],
      );
      if (!result.rowCount) throw new HttpError(404, "التصنيف غير موجود");
    } else {
      id = (
        await client.query(
          "SELECT (COALESCE(max(id::bigint),0)+1)::text AS id FROM jdatna.categories WHERE id~'^[0-9]+$'",
        )
      ).rows[0].id;
      await client.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon,parent_id) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          value.name,
          value.slug ?? `cat-${id}`,
          value.icon,
          value.parentId ?? null,
        ],
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
  assertAdmin(user, "locations");
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
  assertAdmin(user, "locations");
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
    if (value.kind === "region")
      await client.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,region_id) VALUES($1,'region',$2,$3)",
        ["region:" + id, value.name, id],
      );
    if (value.kind === "city")
      await client.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id,city_id) VALUES($1,'city',$2,$3,$4,$5)",
        [
          "city:" + id,
          value.name,
          "region:" + value.regionId,
          value.regionId,
          id,
        ],
      );
    await audit(client, user, "location.create", null, { ...value, id });
    return { id };
  });
}
export async function adminReports(user: SessionUser) {
  assertAdmin(user, "reports");
  return (
    await db().query(
      `SELECT r.id,r.product_id AS "productId",r.producer_id AS "producerId",x.name AS "productName",p.name AS "producerName",r.reason,r.status,r.resolution_reason AS "reviewReason",r.created_at AS "createdAt" FROM jdatna.reports r LEFT JOIN jdatna.products x ON x.id=r.product_id LEFT JOIN jdatna.producer_profiles p ON p.id=COALESCE(r.producer_id,x.producer_id) ORDER BY r.created_at DESC LIMIT 200`,
    )
  ).rows;
}
export async function resolveReport(user: SessionUser, input: unknown) {
  assertAdmin(user, "reports");
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
// ملخص لوحة الإدارة: أرقام تبدأ منها المراجعة اليومية.
export async function adminSummary(user: SessionUser) {
  assertAdmin(user);
  const row = (
    await db().query(
      `SELECT
        (SELECT count(*)::int FROM jdatna.producer_profiles WHERE status='pending') AS "familiesPending",
        (SELECT count(*)::int FROM jdatna.producer_profiles WHERE status='approved') AS "familiesApproved",
        (SELECT count(*)::int FROM jdatna.producer_profiles WHERE status='rejected') AS "familiesIncomplete",
        (SELECT count(*)::int FROM jdatna.reports WHERE status IN ('new','reviewing')) AS "reportsOpen",
        (SELECT count(*)::int FROM jdatna.order_requests WHERE created_at > now()-interval '24 hours') AS "ordersToday",
        (SELECT count(*)::int FROM jdatna.order_requests WHERE status='pending' AND created_at < now()-interval '24 hours') AS "ordersStale",
        (SELECT count(*)::int FROM jdatna.products WHERE visible=true AND status<>'unavailable') AS "productsLive"`,
    )
  ).rows[0];
  return row as Record<string, number>;
}
// متابعة الطلبات للإدارة: قراءة فقط، آخر 200 طلب مع اسم الأسرة المنتجة.
export async function adminOrders(user: SessionUser) {
  assertAdmin(user, "orders");
  return (
    await db().query(
      `SELECT o.id,o.status,o.snapshot->>'productName' AS "productName",COALESCE(p.trade_name,p.name) AS "producerName",p.slug AS "producerSlug",o.customer_name AS "customerName",o.phone,o.quantity,o.meal,o.start_date::text AS "startDate",o.created_at AS "createdAt",o.updated_at AS "updatedAt",
        (o.status='pending' AND o.created_at < now()-interval '24 hours') AS stale
       FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       ORDER BY (o.status='pending') DESC,o.created_at DESC LIMIT 200`,
    )
  ).rows;
}

/** إخفاء القسم أو إظهاره للزوار وللأسر، دون حذفه ولا فصل منتجاته. */
export async function setCategoryHidden(user: SessionUser, input: unknown) {
  assertAdmin(user, "categories");
  const { id, hidden } = z
    .object({ id: z.string().min(1).max(30), hidden: z.boolean() })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const r = await client.query(
      "UPDATE jdatna.categories SET hidden=$2 WHERE id=$1",
      [id, hidden],
    );
    if (!r.rowCount) throw new HttpError(404, "القسم غير موجود");
    await audit(
      client,
      user,
      hidden ? "category.hide" : "category.show",
      null,
      {
        id,
      },
    );
    return { id, hidden };
  });
}
