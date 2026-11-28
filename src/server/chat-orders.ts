import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
import { participant, sendMessage } from "./chat";
import { riyadhTodaySql } from "./cooking-availability";
import { assertOrderProduct, orderSnapshot } from "./orders";

/**
 * الطلب داخل المحادثة (قرار المالك 2026-11-27):
 * - العميل يطلب من المحادثة (المنتج والكمية وملاحظة)، والأسرة «موافقة وإتمام» فيُسجَّل منفّذًا، أو «اعتذار».
 * - قبل الإتمام: العميل يلغي متى شاء.
 * - خلال ١٠ دقائق من الإتمام: أي طرف يلغيه مباشرة.
 * - بعدها بالاتفاق: طرف يطلب الإلغاء والآخر يوافق (أو يُبقيه).
 * كل خطوة تُكتب رسالة في المحادثة، فيصل الإشعار والتحديث اللحظي للطرفين كالرسائل.
 */
export const CANCEL_WINDOW_MS = 10 * 60 * 1000;

export type ChatOrderAction =
  | "complete"
  | "decline"
  | "cancel"
  | "request-cancel"
  | "agree-cancel"
  | "keep";

export type ChatOrderState = {
  status: string;
  completedAt: Date | string | null;
  cancelRequestedBy: string | null;
};

const OPEN = ["pending", "accepted", "preparing", "ready"];

/** ما يستطيعه هذا الطرف الآن على الطلب. */
export function chatOrderActions(
  o: ChatOrderState,
  side: "customer" | "producer",
  userId: string,
  now = Date.now(),
): ChatOrderAction[] {
  if (OPEN.includes(o.status))
    return side === "producer" ? ["complete", "decline"] : ["cancel"];
  if (o.status !== "completed" || !o.completedAt) return [];
  if (now - new Date(o.completedAt).getTime() < CANCEL_WINDOW_MS)
    return ["cancel"];
  if (!o.cancelRequestedBy) return ["request-cancel"];
  return o.cancelRequestedBy === userId ? [] : ["agree-cancel", "keep"];
}

async function familyConversation(user: SessionUser, id: string) {
  const c = await participant(db(), user, id);
  if (c.kind === "courier" || !c.producer_id)
    throw new HttpError(404, "الطلب من المحادثة للأسر المنتجة فقط");
  return c;
}

export async function chatOrders(user: SessionUser, id: string) {
  const c = await familyConversation(user, id);
  const rows = (
    await db().query(
      `SELECT o.id,o.snapshot->>'productName' AS "productName",o.snapshot->>'unit' AS unit,
              (o.snapshot->>'price')::numeric AS price,o.quantity,o.notes,o.status,
              co.created_at AS "createdAt",co.completed_at AS "completedAt",
              co.cancel_requested_by AS "cancelRequestedBy",co.cancel_requested_at AS "cancelRequestedAt"
         FROM jdatna.chat_orders co JOIN jdatna.order_requests o ON o.id=co.order_id
        WHERE co.conversation_id=$1 ORDER BY co.created_at DESC LIMIT 20`,
      [c.id],
    )
  ).rows as (ChatOrderState & {
    id: string;
    productName: string;
    unit: string;
    price: string | number | null;
    quantity: number;
    notes: string;
    createdAt: string;
    cancelRequestedAt: string | null;
  })[];
  const now = Date.now();
  const orders = rows.map((o) => ({
    ...o,
    price: o.price === null ? null : Number(o.price),
    cancelRequestedByMe: o.cancelRequestedBy === user.id,
    cancelRequestedBy: undefined,
    actions: chatOrderActions(o, c.side, user.id, now),
    cancelUntil:
      o.status === "completed" && o.completedAt
        ? new Date(new Date(o.completedAt).getTime() + CANCEL_WINDOW_MS)
        : null,
  }));
  const products =
    c.side === "customer"
      ? ((
          await db().query(
            `SELECT x.id,x.name,x.unit,x.price FROM jdatna.products x
               JOIN jdatna.producer_profiles p ON p.id=x.producer_id
              WHERE x.producer_id=$1 AND x.visible AND x.status IN ('available','preorder') AND p.status='approved'
              ORDER BY x.name LIMIT 100`,
            [c.producer_id],
          )
        ).rows.map((p) => ({
          ...p,
          price: p.price === null ? null : Number(p.price),
        })) as {
          id: string;
          name: string;
          unit: string;
          price: number | null;
        }[])
      : [];
  return { side: c.side, orders, products };
}

const createSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.coerce.number().int().min(1).max(1000),
    notes: z.string().trim().max(500).default(""),
  })
  .strict();

export async function createChatOrder(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  const v = createSchema.parse(input);
  const c = await familyConversation(user, id);
  if (c.side !== "customer")
    throw new HttpError(403, "الطلب من المحادثة للعميل");
  if (c.blocked_by) throw new HttpError(403, "لا يمكن الطلب في هذه المحادثة");
  const orderId = randomUUID();
  const productName = await transaction(async (client) => {
    const product = (
      await client.query(
        `SELECT x.name,x.unit,x.price,x.status,x.visible,x.delivery_scope AS "deliveryScope",x.shipping_fee AS "shippingFee",
                p.id AS "producerId",COALESCE(p.trade_name,p.name) AS "producerName",p.status AS "producerStatus"
           FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
          WHERE x.id=$1 AND x.producer_id=$2 FOR SHARE OF x,p`,
        [v.productId, c.producer_id],
      )
    ).rows[0];
    assertOrderProduct(product);
    const { assertReviewPair } = await import("./store-review");
    await assertReviewPair(client, user.id, product.producerId);
    const name = user.name?.trim().length >= 2 ? user.name.trim() : "عميل";
    await client.query(
      `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,notes)
       VALUES($1,$2,'chat',$3,$4,$5,$6,$7,$8,$9,'occasion',${riyadhTodaySql},${riyadhTodaySql},$10)`,
      [
        orderId,
        randomUUID(),
        user.id,
        product.producerId,
        v.productId,
        JSON.stringify(orderSnapshot(product)),
        name.slice(0, 120),
        user.phone,
        v.quantity,
        v.notes,
      ],
    );
    await client.query(
      "INSERT INTO jdatna.chat_orders(order_id,conversation_id) VALUES($1,$2)",
      [orderId, c.id],
    );
    return product.name as string;
  });
  await sendMessage(user, c.id, {
    body: `🧾 طلب: ${productName} × ${v.quantity}${v.notes ? `\nملاحظة: ${v.notes}` : ""}`,
  });
  return chatOrders(user, c.id);
}

const actSchema = z
  .object({
    orderId: z.uuid(),
    action: z.enum([
      "complete",
      "decline",
      "cancel",
      "request-cancel",
      "agree-cancel",
      "keep",
    ]),
  })
  .strict();

const NOTES: Record<ChatOrderAction, string> = {
  complete: "✅ تمت الموافقة وإتمام الطلب",
  decline: "↩️ اعتذرت الأسرة عن الطلب",
  cancel: "✖️ أُلغي الطلب",
  "request-cancel": "⏳ طلب إلغاء الطلب، بانتظار موافقة الطرف الآخر",
  "agree-cancel": "✖️ أُلغي الطلب بالاتفاق",
  keep: "✔️ بقي الطلب منفّذًا (رُفض طلب الإلغاء)",
};

export async function actOnChatOrder(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  const v = actSchema.parse(input);
  const c = await familyConversation(user, id);
  const productName = await transaction(async (client) => {
    const o = (
      await client.query(
        `SELECT o.status,o.snapshot->>'productName' AS "productName",co.completed_at AS "completedAt",
                co.cancel_requested_by AS "cancelRequestedBy"
           FROM jdatna.chat_orders co JOIN jdatna.order_requests o ON o.id=co.order_id
          WHERE co.order_id=$1 AND co.conversation_id=$2 FOR UPDATE OF o,co`,
        [v.orderId, c.id],
      )
    ).rows[0] as (ChatOrderState & { productName: string }) | undefined;
    if (!o) throw new HttpError(404, "الطلب غير موجود");
    if (!chatOrderActions(o, c.side, user.id).includes(v.action))
      throw new HttpError(
        409,
        v.action === "cancel" && o.status === "completed"
          ? "انتهت مهلة الإلغاء (١٠ دقائق)؛ اطلب الإلغاء من الطرف الآخر"
          : "لا يمكن هذا الإجراء على الطلب الآن",
      );
    const status =
      v.action === "complete"
        ? "completed"
        : v.action === "decline"
          ? "declined"
          : v.action === "cancel" || v.action === "agree-cancel"
            ? "cancelled"
            : null;
    if (status)
      await client.query(
        "UPDATE jdatna.order_requests SET status=$2,updated_at=now() WHERE id=$1",
        [v.orderId, status],
      );
    await client.query(
      `UPDATE jdatna.chat_orders SET
         completed_at=CASE WHEN $2='complete' THEN now() ELSE completed_at END,
         cancel_requested_by=CASE WHEN $2='request-cancel' THEN $3::uuid WHEN $2 IN ('keep','agree-cancel') THEN NULL ELSE cancel_requested_by END,
         cancel_requested_at=CASE WHEN $2='request-cancel' THEN now() WHEN $2 IN ('keep','agree-cancel') THEN NULL ELSE cancel_requested_at END,
         closed_by=CASE WHEN $4::text IS NOT NULL THEN $3::uuid ELSE closed_by END
       WHERE order_id=$1`,
      [v.orderId, v.action, user.id, status],
    );
    return o.productName;
  });
  await sendMessage(user, c.id, {
    body: `${NOTES[v.action]}: ${productName}`,
  });
  return chatOrders(user, c.id);
}
