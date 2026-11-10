import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
import { notifyUser } from "./push";

export type ConversationSummary = {
  id: string;
  side: "customer" | "producer";
  title: string;
  preview: string | null;
  lastAt: string;
  unread: number;
};
export type ChatMessage = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
};

/**
 * يبدأ محادثة العضو مع أسرة معتمدة، أو يعيد محادثتهما القائمة.
 * ويمكن بدؤها من طلب: صاحب الطلب يراسل الأسرة، والأسرة تراسل صاحب الطلب.
 */
export async function startConversation(user: SessionUser, input: unknown) {
  const parsed = z
    .union([
      z.object({ producer: z.string().min(1).max(200) }).strict(),
      z.object({ order: z.uuid() }).strict(),
    ])
    .parse(input);
  let customerId: string, producerId: string;
  if ("order" in parsed) {
    const order = (
      await db().query(
        `SELECT o.user_id,o.producer_id,p.user_id AS producer_user
         FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
         WHERE o.id=$1`,
        [parsed.order],
      )
    ).rows[0];
    if (
      !order ||
      (order.user_id !== user.id && order.producer_user !== user.id)
    )
      throw new HttpError(404, "الطلب غير موجود");
    if (!order.user_id)
      throw new HttpError(400, "طلب الضيف بلا حساب؛ تواصل معه بالجوال");
    if (order.user_id === order.producer_user)
      throw new HttpError(400, "لا يمكنك مراسلة أسرتك من حسابك نفسه");
    customerId = order.user_id;
    producerId = order.producer_id;
  } else {
    const family = (
      await db().query(
        "SELECT id,user_id FROM jdatna.producer_profiles WHERE slug=$1 AND status='approved'",
        [parsed.producer],
      )
    ).rows[0];
    if (!family) throw new HttpError(404, "الأسرة المنتجة غير متاحة للمراسلة");
    if (family.user_id === user.id)
      throw new HttpError(400, "لا يمكنك مراسلة أسرتك من حسابك نفسه");
    customerId = user.id;
    producerId = family.id;
  }
  const row = (
    await db().query(
      `INSERT INTO jdatna.conversations(id,customer_id,producer_id) VALUES($1,$2,$3)
       ON CONFLICT(customer_id,producer_id) DO UPDATE SET customer_id=EXCLUDED.customer_id
       RETURNING id`,
      [randomUUID(), customerId, producerId],
    )
  ).rows[0];
  return { id: row.id as string };
}

/** محادثات المستخدم: كعميل، وكأسرة منتجة لمحادثات أسرته. */
export async function listConversations(
  user: SessionUser,
): Promise<ConversationSummary[]> {
  return (
    await db().query(
      `SELECT c.id,
        CASE WHEN c.customer_id=$1 THEN 'customer' ELSE 'producer' END AS side,
        CASE WHEN c.customer_id=$1 THEN COALESCE(p.trade_name,p.name) ELSE u.name END AS title,
        (SELECT m.body FROM jdatna.messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
        c.last_message_at AS "lastAt",
        (SELECT count(*)::int FROM jdatna.messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1
          AND m.created_at > CASE WHEN c.customer_id=$1 THEN c.customer_read_at ELSE c.producer_read_at END) AS unread
       FROM jdatna.conversations c
       JOIN jdatna.producer_profiles p ON p.id=c.producer_id
       JOIN jdatna.users u ON u.id=c.customer_id
       WHERE c.customer_id=$1 OR p.user_id=$1
       ORDER BY c.last_message_at DESC LIMIT 100`,
      [user.id],
    )
  ).rows;
}

export async function unreadTotal(user: SessionUser) {
  return (await listConversations(user)).reduce((n, c) => n + c.unread, 0);
}

/**
 * وصلت رسائل الطرف الآخر لجهاز المستخدم (✓✓ رمادي عند المرسل): يُسجَّل عند كل فحص
 * من التطبيق المفتوح أو عند عرض قائمة المحادثات.
 */
export async function markDelivered(user: SessionUser) {
  await db().query(
    "UPDATE jdatna.conversations SET customer_delivered_at=now() WHERE customer_id=$1",
    [user.id],
  );
  await db().query(
    `UPDATE jdatna.conversations c SET producer_delivered_at=now()
     FROM jdatna.producer_profiles p WHERE p.id=c.producer_id AND p.user_id=$1`,
    [user.id],
  );
}

/** تنبيه الرسائل الجديدة: مجموع غير المقروء وأحدث المحادثات التي فيها جديد. */
export async function unreadConversations(user: SessionUser) {
  await markDelivered(user);
  const unread = (await listConversations(user)).filter((c) => c.unread > 0);
  return {
    total: unread.reduce((n, c) => n + c.unread, 0),
    conversations: unread.slice(0, 5).map((c) => ({
      id: c.id,
      title: c.title,
      preview: c.preview,
      unread: c.unread,
      lastAt: c.lastAt,
    })),
  };
}

/** طرف المحادثة فقط يصل إليها؛ غيره يرى «غير موجودة». */
async function participant(
  client: Pick<PoolClient, "query">,
  user: SessionUser,
  id: string,
  lock = false,
) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "المحادثة غير موجودة");
  const row = (
    await client.query(
      `SELECT c.id,c.customer_id,p.user_id AS producer_user,c.blocked_by,c.producer_id,
        c.customer_read_at,c.producer_read_at,c.customer_delivered_at,c.producer_delivered_at,
        CASE WHEN c.customer_id=$1 THEN COALESCE(p.trade_name,p.name) ELSE u.name END AS title,
        p.slug AS "producerSlug"
       FROM jdatna.conversations c
       JOIN jdatna.producer_profiles p ON p.id=c.producer_id
       JOIN jdatna.users u ON u.id=c.customer_id
       WHERE c.id=$2 AND (c.customer_id=$1 OR p.user_id=$1)${lock ? " FOR UPDATE OF c" : ""}`,
      [user.id, id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "المحادثة غير موجودة");
  const side: "customer" | "producer" =
    row.customer_id === user.id ? "customer" : "producer";
  return { ...row, side } as {
    id: string;
    title: string;
    producerSlug: string;
    side: "customer" | "producer";
    blocked_by: string | null;
    producer_id: string;
    customer_read_at: Date;
    producer_read_at: Date;
    customer_delivered_at: Date;
    producer_delivered_at: Date;
  };
}

/** رسائل المحادثة (الأحدث 200، أو ما بعد وقت معيّن للتحديث)، وتعليمها مقروءة. */
export async function conversationMessages(
  user: SessionUser,
  id: string,
  after?: string,
) {
  const since =
    after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  return transaction(async (client) => {
    const c = await participant(client, user, id);
    const rows = (
      await client.query(
        since
          ? `SELECT id,body,sender_id=$2 AS mine,created_at AS "createdAt" FROM jdatna.messages
             WHERE conversation_id=$1 AND created_at>$3 ORDER BY created_at LIMIT 200`
          : `SELECT * FROM (SELECT id,body,sender_id=$2 AS mine,created_at AS "createdAt" FROM jdatna.messages
             WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 200) m ORDER BY "createdAt"`,
        since ? [c.id, user.id, since] : [c.id, user.id],
      )
    ).rows as ChatMessage[];
    // فتح المحادثة = قراءة واستلام (✓✓ أزرق عند الطرف الآخر).
    await client.query(
      `UPDATE jdatna.conversations SET ${c.side === "customer" ? "customer_read_at=now(),customer_delivered_at=now()" : "producer_read_at=now(),producer_delivered_at=now()"} WHERE id=$1`,
      [c.id],
    );
    const other = c.side === "customer" ? "producer" : "customer";
    return {
      conversation: {
        id: c.id,
        title: c.title,
        side: c.side,
        producerSlug: c.producerSlug,
        blocked: Boolean(c.blocked_by),
        blockedByMe: c.blocked_by === user.id,
        // متى قرأ الطرف الآخر ومتى استلم: رسائلي قبلها مقروءة أو مستلمة.
        otherReadAt: c[`${other}_read_at`],
        otherDeliveredAt: c[`${other}_delivered_at`],
      },
      messages: rows,
    };
  });
}

export async function sendMessage(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  const { body } = z
    .object({ body: z.string().trim().min(1).max(2000) })
    .strict()
    .parse(input);
  const sent = await transaction(async (client) => {
    const c = await participant(client, user, id, true);
    if (c.blocked_by)
      throw new HttpError(
        403,
        c.blocked_by === user.id
          ? "حظرت هذه المحادثة؛ ألغِ الحظر لترسل"
          : "لا يمكن الإرسال في هذه المحادثة",
      );
    const message = (
      await client.query(
        `INSERT INTO jdatna.messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)
         RETURNING id,body,true AS mine,created_at AS "createdAt"`,
        [randomUUID(), c.id, user.id, body],
      )
    ).rows[0] as ChatMessage;
    await client.query(
      `UPDATE jdatna.conversations SET last_message_at=$2,${c.side === "customer" ? "customer_read_at" : "producer_read_at"}=$2 WHERE id=$1`,
      [c.id, message.createdAt],
    );
    const raw = c as unknown as { customer_id: string; producer_user: string };
    return {
      message,
      to: c.side === "customer" ? raw.producer_user : raw.customer_id,
      conversation: c.id,
    };
  });
  // إشعار الجوال للطرف الآخر بعد حفظ الرسالة، دون انتظار يؤخر المرسل.
  void notifyUser(sent.to, {
    title: `رسالة جديدة من ${user.name}`,
    body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
    url: `/messages?c=${sent.conversation}`,
    tag: `chat-${sent.conversation}`,
  });
  return sent.message;
}

/**
 * أمان المحادثات (شرط المتاجر للمحتوى من المستخدمين): الإبلاغ للإدارة، والحظر
 * الذي يمنع الطرفين من الإرسال، وإلغاء الحظر لمن حظر فقط.
 */
export async function moderateConversation(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  const value = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("block") }).strict(),
      z.object({ action: z.literal("unblock") }).strict(),
      z
        .object({
          action: z.literal("report"),
          reason: z.string().trim().min(10).max(1000),
          block: z.boolean().optional(),
        })
        .strict(),
    ])
    .parse(input);
  return transaction(async (client) => {
    const c = await participant(client, user, id, true);
    if (value.action === "unblock") {
      if (c.blocked_by && c.blocked_by !== user.id)
        throw new HttpError(403, "الطرف الآخر هو من حظر المحادثة");
      await client.query(
        "UPDATE jdatna.conversations SET blocked_by=NULL WHERE id=$1",
        [c.id],
      );
      return { blocked: false, blockedByMe: false };
    }
    if (value.action === "report") {
      await client.query(
        "INSERT INTO jdatna.reports(id,reporter_id,producer_id,reason) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          user.id,
          c.producer_id,
          `بلاغ محادثة (${c.id}) من ${c.side === "customer" ? "العميل" : "الأسرة"}: ${value.reason}`,
        ],
      );
      if (!value.block)
        return {
          reported: true,
          blocked: Boolean(c.blocked_by),
          blockedByMe: c.blocked_by === user.id,
        };
    }
    if (!c.blocked_by)
      await client.query(
        "UPDATE jdatna.conversations SET blocked_by=$2 WHERE id=$1",
        [c.id, user.id],
      );
    return {
      reported: value.action === "report",
      blocked: true,
      blockedByMe: !c.blocked_by || c.blocked_by === user.id,
    };
  });
}
