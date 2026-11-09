import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
export const preferenceSchema = z.object({
  groups: z.array(z.enum(["students", "employees", "families"])).max(3),
});
export const offerSchema = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000),
    terms: z.string().trim().min(1).max(2000),
    productId: z.uuid().nullable().default(null),
    price: z
      .number()
      .min(0)
      .max(99999999.99)
      .multipleOf(0.01)
      .nullable()
      .default(null),
    audience: z.enum(["general", "students", "employees", "families"]),
    meal: z.enum(["breakfast", "lunch", "dinner", "occasion"]),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    enabled: z.boolean(),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: "نهاية العرض يجب أن تكون بعد بدايته",
  });
export function offerVisible(
  row: {
    enabled: boolean;
    producerStatus: string;
    startsAt: string;
    endsAt: string;
    audience: string;
    productId?: string | null;
    productVisible?: boolean;
    productStatus?: string;
  },
  groups: string[],
  now = new Date(),
) {
  return (
    row.enabled &&
    row.producerStatus === "approved" &&
    Date.parse(row.startsAt) <= +now &&
    Date.parse(row.endsAt) > +now &&
    (!row.productId ||
      (row.productVisible === true && row.productStatus !== "unavailable")) &&
    (row.audience === "general" || groups.includes(row.audience))
  );
}
const select = `SELECT o.id,o.producer_id AS "producerId",o.product_id AS "productId",o.title,o.description,o.terms,o.price::float8 AS price,o.audience,o.meal,o.starts_at AS "startsAt",o.ends_at AS "endsAt",o.enabled,COALESCE(p.trade_name,p.name) AS "producerName",p.slug AS "producerSlug" FROM jdatna.offers o JOIN jdatna.producer_profiles p ON p.id=o.producer_id`;
const visible = `p.status='approved' AND o.enabled AND o.starts_at<=now() AND o.ends_at>now() AND (o.product_id IS NULL OR EXISTS(SELECT 1 FROM jdatna.products x WHERE x.id=o.product_id AND x.producer_id=o.producer_id AND x.visible AND x.status IN ('available','preorder'))) AND (o.audience='general' OR EXISTS(SELECT 1 FROM jdatna.offer_preferences f WHERE f.user_id=$1 AND f.audience=o.audience))`;
export async function listOffers(user: SessionUser | null) {
  return (
    await db().query(
      `${select} WHERE ${visible} ORDER BY o.created_at DESC LIMIT 200`,
      [user?.id ?? null],
    )
  ).rows;
}
export async function getAccessibleOffer(
  user: SessionUser | null,
  offerId: string,
  productId: string,
) {
  if (
    !z.uuid().safeParse(offerId).success ||
    !z.uuid().safeParse(productId).success
  )
    throw new HttpError(404, "العرض غير متاح");
  const row = (
    await db().query(
      `SELECT o.id,o.product_id AS "productId",o.title,o.price::float8 AS price,o.terms,o.meal FROM jdatna.offers o JOIN jdatna.producer_profiles p ON p.id=o.producer_id WHERE ${visible} AND o.id=$2 AND o.product_id=$3`,
      [user?.id ?? null, offerId, productId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "العرض غير متاح");
  return row as {
    id: string;
    productId: string;
    title: string;
    price: number | null;
    terms: string;
    meal: "breakfast" | "lunch" | "dinner" | "occasion";
  };
}
export async function assertOfferAccess(
  user: SessionUser | null,
  offerId: string,
  producerId: string,
  productId: string,
  client?: PoolClient,
): Promise<{
  label: string;
  price: number | null;
  meal: "breakfast" | "lunch" | "dinner" | "occasion";
}> {
  if (!z.uuid().safeParse(offerId).success)
    throw new HttpError(404, "العرض غير متاح");
  const query = client ?? db();
  // Preference updates lock the user too, so membership cannot change during acceptance.
  if (client && user)
    await client.query("SELECT id FROM jdatna.users WHERE id=$1 FOR SHARE", [
      user.id,
    ]);
  const row = (
    await query.query(
      `${select} WHERE ${visible} AND o.id=$2 AND o.producer_id=$3 AND o.product_id=$4${client ? " FOR SHARE OF o" : ""}`,
      [user?.id ?? null, offerId, producerId, productId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "العرض غير متاح");
  return { label: row.title, price: row.price, meal: row.meal };
}
export async function getOfferPreferences(user: SessionUser) {
  return (
    await db().query(
      "SELECT audience FROM jdatna.offer_preferences WHERE user_id=$1",
      [user.id],
    )
  ).rows.map((r) => r.audience as string);
}
export async function saveOfferPreferences(user: SessionUser, input: unknown) {
  const { groups } = preferenceSchema.parse(input);
  return transaction(async (c) => {
    await c.query("SELECT id FROM jdatna.users WHERE id=$1 FOR UPDATE", [
      user.id,
    ]);
    await c.query("DELETE FROM jdatna.offer_preferences WHERE user_id=$1", [
      user.id,
    ]);
    for (const group of new Set(groups))
      await c.query(
        "INSERT INTO jdatna.offer_preferences(user_id,audience) VALUES($1,$2)",
        [user.id, group],
      );
    return { groups: [...new Set(groups)] };
  });
}
export async function ownOffers(user: SessionUser) {
  return (
    await db().query(
      `${select} WHERE p.user_id=$1 ORDER BY o.created_at DESC LIMIT 200`,
      [user.id],
    )
  ).rows;
}
export async function saveOffer(
  user: SessionUser,
  input: unknown,
  editing: boolean,
) {
  const v = offerSchema.parse(input);
  if (editing && !v.id) throw new HttpError(400, "معرف العرض مطلوب");
  return transaction(async (c) => {
    const producer = (
      await c.query(
        "SELECT id,status FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!producer || producer.status !== "approved")
      throw new HttpError(
        403,
        "إدارة العروض متاحة للأسرة المنتجة المعتمدة فقط",
      );
    if (
      v.productId &&
      !(
        await c.query(
          "SELECT id FROM jdatna.products WHERE id=$1 AND producer_id=$2 FOR SHARE",
          [v.productId, producer.id],
        )
      ).rowCount
    )
      throw new HttpError(400, "اختر منتجًا من منتجات أسرتك");
    const id = editing ? v.id! : randomUUID();
    const args = [
      id,
      producer.id,
      v.productId,
      v.title,
      v.description,
      v.terms,
      v.price,
      v.audience,
      v.meal,
      v.startsAt,
      v.endsAt,
      v.enabled,
    ];
    const result = editing
      ? await c.query(
          `UPDATE jdatna.offers SET product_id=$3,title=$4,description=$5,terms=$6,price=$7,audience=$8,meal=$9,starts_at=$10,ends_at=$11,enabled=$12,updated_at=now() WHERE id=$1 AND producer_id=$2 RETURNING id`,
          args,
        )
      : await c.query(
          `INSERT INTO jdatna.offers(id,producer_id,product_id,title,description,terms,price,audience,meal,starts_at,ends_at,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          args,
        );
    if (!result.rowCount) throw new HttpError(404, "العرض غير موجود");
    return { id };
  });
}
