import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";

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

/** يبدأ محادثة العضو مع أسرة معتمدة، أو يعيد محادثتهما القائمة. */
export async function startConversation(user: SessionUser, input: unknown) {
  const { producer } = z
    .object({ producer: z.string().min(1).max(200) })
    .strict()
    .parse(input);
  const family = (
    await db().query(
      "SELECT id,user_id FROM jdatna.producer_profiles WHERE slug=$1 AND status='approved'",
      [producer],
    )
  ).rows[0];
  if (!family) throw new HttpError(404, "الأسرة المنتجة غير متاحة للمراسلة");
  if (family.user_id === user.id)
    throw new HttpError(400, "لا يمكنك مراسلة أسرتك من حسابك نفسه");
  const row = (
    await db().query(
      `INSERT INTO jdatna.conversations(id,customer_id,producer_id) VALUES($1,$2,$3)
       ON CONFLICT(customer_id,producer_id) DO UPDATE SET customer_id=EXCLUDED.customer_id
       RETURNING id`,
      [randomUUID(), user.id, family.id],
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
      `SELECT c.id,c.customer_id,p.user_id AS producer_user,
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
    await client.query(
      `UPDATE jdatna.conversations SET ${c.side === "customer" ? "customer_read_at" : "producer_read_at"}=now() WHERE id=$1`,
      [c.id],
    );
    return {
      conversation: {
        id: c.id,
        title: c.title,
        side: c.side,
        producerSlug: c.producerSlug,
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
  return transaction(async (client) => {
    const c = await participant(client, user, id, true);
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
    return message;
  });
}
