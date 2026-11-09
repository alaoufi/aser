import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError, normalizePhone } from "./security";
import {
  assertCookingStart,
  notCookingTodaySql,
  riyadhDate,
  riyadhTodaySql,
} from "./cooking-availability";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "التاريخ غير صحيح");
const schema = z
  .object({
    productId: z.uuid(),
    offerId: z.uuid().optional(),
    requestKey: z.uuid(),
    name: z.string().trim().min(2).max(120),
    phone: z.string().max(30),
    quantity: z.number().int().min(1).max(1000),
    meal: z.enum(["breakfast", "lunch", "dinner", "occasion"]),
    startDate: date,
    days: z.number().int().min(1).max(366).optional(),
    endDate: date.optional(),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine(
    (v) => (v.days !== undefined) !== (v.endDate !== undefined),
    "حدد عدد الأيام أو تاريخ النهاية فقط",
  );
export function parseOrderRequest(input: unknown, now = new Date()) {
  const value = schema.parse(input);
  const today = riyadhDate(now);
  const start = new Date(value.startDate + "T00:00:00Z").getTime();
  const days =
    value.days ??
    Math.round(
      (new Date(value.endDate + "T00:00:00Z").getTime() - start) / 86400000,
    ) + 1;
  if (
    value.startDate < today ||
    start > new Date(today + "T00:00:00Z").getTime() + 366 * 86400000 ||
    days < 1 ||
    days > 366
  )
    throw new HttpError(400, "اختر بداية خلال سنة ومدة من يوم إلى 366 يومًا");
  return {
    ...value,
    phone: normalizePhone(value.phone),
    days,
    endDate: new Date(start + (days - 1) * 86400000).toISOString().slice(0, 10),
  };
}
type OrderProduct = {
  notCookingToday?: boolean;
  name: string;
  unit: string;
  price: string | number | null;
  producerName: string;
  status: string;
  visible: boolean;
  producerStatus: string;
  producerId: string;
};
export function assertOrderProduct(
  product: Partial<OrderProduct> | undefined,
): asserts product is OrderProduct {
  if (
    !product ||
    !product.visible ||
    product.producerStatus !== "approved" ||
    !["available", "preorder"].includes(product.status ?? "")
  )
    throw new HttpError(404, "المنتج أو الأسرة غير متاح للطلب");
}
export function orderSnapshot(
  product: Pick<OrderProduct, "name" | "unit" | "price" | "producerName">,
  offer?: { label: string; price: number | null },
) {
  return {
    productName: product.name,
    unit: product.unit,
    price: product.price === null ? null : Number(product.price),
    producerName: product.producerName,
    offer: offer ? { label: offer.label, price: offer.price } : null,
  };
}
export function assertOrderTransition(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    pending: ["accepted", "declined", "cancelled"],
    accepted: ["preparing", "ready", "completed", "cancelled"],
    preparing: ["ready", "completed", "cancelled"],
    ready: ["completed", "cancelled"],
    declined: [],
    completed: [],
    cancelled: [],
  };
  if (!transitions[from] || (from !== to && !transitions[from].includes(to)))
    throw new HttpError(409, "لا يمكن تغيير حالة الطلب بهذه الطريقة");
}
export function assertOfferMeal(requestMeal: string, offerMeal: string) {
  if (requestMeal !== offerMeal)
    throw new HttpError(400, "اختر وجبة العرض المحددة");
}
export async function submitOrder(user: SessionUser | null, input: unknown) {
  const value = parseOrderRequest(input);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...value, userId: user?.id ?? null }))
    .digest("hex");
  return transaction(async (client) => {
    // Serialize retries before checking availability; only an identical request can retrieve its receipt.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      value.requestKey,
    ]);
    const existing = (
      await client.query(
        "SELECT id,status,request_hash FROM jdatna.order_requests WHERE request_key=$1",
        [value.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== fingerprint)
        throw new HttpError(409, "مفتاح الطلب مستخدم لطلب مختلف");
      return { id: existing.id, status: existing.status };
    }
    const product = (
      await client.query(
        `SELECT x.name,x.unit,x.price,x.status,x.visible,p.id AS "producerId",COALESCE(p.trade_name,p.name) AS "producerName",p.status AS "producerStatus" FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE x.id=$1 FOR SHARE OF x,p`,
        [value.productId],
      )
    ).rows[0];
    assertOrderProduct(product);
    const cooking = (
      await client.query(
        `SELECT ${notCookingTodaySql()} AS closed,${riyadhTodaySql}::text AS day FROM jdatna.producer_profiles p WHERE p.id=$1`,
        [product.producerId],
      )
    ).rows[0];
    assertCookingStart(cooking.closed, value.startDate, cooking.day);
    let offer:
      { label: string; price: number | null; meal: string } | undefined;
    if (value.offerId) {
      const { assertOfferAccess } = await import("./offers");
      offer = await assertOfferAccess(
        user,
        value.offerId,
        product.producerId,
        value.productId,
        client,
      );
      assertOfferMeal(value.meal, offer.meal);
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,offer_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        value.requestKey,
        fingerprint,
        user?.id ?? null,
        product.producerId,
        value.productId,
        value.offerId ?? null,
        JSON.stringify(orderSnapshot(product, offer)),
        value.name,
        value.phone,
        value.quantity,
        value.meal,
        value.startDate,
        value.endDate,
        value.notes,
      ],
    );
    return { id, status: "pending" };
  });
}
const fields = `o.id,o.product_id AS "productId",o.snapshot,o.customer_name AS name,o.phone,o.quantity,o.meal,o.start_date::text AS "startDate",o.end_date::text AS "endDate",(o.end_date-o.start_date+1) AS days,o.notes,o.status,o.created_at AS "createdAt"`;
export async function memberOrders(user: SessionUser) {
  // Ownership never comes from a phone, body, or query string.
  return (
    await db().query(
      `SELECT ${fields} FROM jdatna.order_requests o WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 200`,
      [user.id],
    )
  ).rows;
}
export async function reorderDraft(user: SessionUser, id: string) {
  z.uuid().parse(id);
  const previous = (
    await db().query(
      `SELECT product_id AS "productId",quantity,meal,(end_date-start_date+1) AS days,notes FROM jdatna.order_requests WHERE id=$1 AND user_id=$2`,
      [id, user.id],
    )
  ).rows[0];
  if (!previous) throw new HttpError(404, "الطلب غير موجود");
  const product = (
    await db().query(
      `SELECT x.name,x.status,x.visible,p.status AS "producerStatus",${notCookingTodaySql()} AS "notCookingToday" FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE x.id=$1`,
      [previous.productId],
    )
  ).rows[0];
  assertOrderProduct(product);
  return {
    ...previous,
    productName: product.name,
    notCookingToday: product.notCookingToday,
  };
}
export async function producerOrders(user: SessionUser) {
  return (
    await db().query(
      `SELECT ${fields},o.producer_seen_at IS NULL AS "isNew" FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id WHERE p.user_id=$1 ORDER BY o.created_at DESC LIMIT 200`,
      [user.id],
    )
  ).rows;
}
export async function updateOrder(user: SessionUser, input: unknown) {
  const value = z
    .object({
      id: z.uuid(),
      status: z.enum([
        "accepted",
        "preparing",
        "ready",
        "declined",
        "completed",
        "cancelled",
      ]),
    })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const order = (
      await client.query(
        `SELECT o.id,o.status FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id WHERE o.id=$1 AND p.user_id=$2 FOR UPDATE OF o`,
        [value.id, user.id],
      )
    ).rows[0];
    if (!order) throw new HttpError(404, "الطلب غير موجود");
    assertOrderTransition(order.status, value.status);
    await client.query(
      "UPDATE jdatna.order_requests SET status=$2,updated_at=now(),producer_seen_at=coalesce(producer_seen_at,now()) WHERE id=$1",
      [order.id, value.status],
    );
    return { id: order.id, status: value.status };
  });
}

// تنبيه «طلب جديد» للأسرة: الطلبات المعلقة التي لم تُعرض بعد، للأسرة المالكة فقط.
export async function producerOrderAlerts(user: SessionUser) {
  const result = await db().query(
    `SELECT o.id,o.snapshot->>'productName' AS "productName",o.customer_name AS name,o.quantity,o.snapshot->>'unit' AS unit,o.meal,o.start_date::text AS "startDate",o.created_at AS "createdAt"
     FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
     WHERE p.user_id=$1 AND o.status='pending' AND o.producer_seen_at IS NULL
     ORDER BY o.created_at DESC LIMIT 20`,
    [user.id],
  );
  const pending = (
    await db().query(
      `SELECT count(*)::int AS n FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id WHERE p.user_id=$1 AND o.status='pending'`,
      [user.id],
    )
  ).rows[0].n as number;
  return { alerts: result.rows, pending };
}
export async function markOrdersSeen(user: SessionUser, input: unknown) {
  const value = z
    .object({ ids: z.array(z.uuid()).min(1).max(50) })
    .strict()
    .parse(input);
  // الملكية من الجلسة فقط؛ معرّفات طلبات أسرة أخرى تُتجاهل.
  const result = await db().query(
    `UPDATE jdatna.order_requests o SET producer_seen_at=now()
     FROM jdatna.producer_profiles p
     WHERE p.id=o.producer_id AND p.user_id=$1 AND o.id=ANY($2::uuid[]) AND o.producer_seen_at IS NULL
     RETURNING o.id`,
    [user.id, value.ids],
  );
  return { seen: result.rows.map((r) => r.id as string) };
}
