import { randomUUID } from "node:crypto";
import { msg } from "./messages";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
import { notifyUser } from "./push";
import { publishLive } from "./live";
import { can } from "../lib/permissions";

/** الطرف الآخر في المحادثة: أسرة منتجة، أو مندوب، أو عميل (تبويبات صفحة المحادثات). */
export type Counterpart = "family" | "courier" | "customer";
export type ConversationSummary = {
  id: string;
  side: "customer" | "producer";
  kind: Counterpart;
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
  /** مدة الرسالة الصوتية بالميلي ثانية، أو null للرسالة النصية. */
  voiceMs: number | null;
};

/** حدود الرسالة الصوتية: دقيقتان، وحجم أقصى 2 ميجابايت. */
export const VOICE_MAX_MS = 120_000;
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;
/**
 * الطرف الآخر: محادثة العميل مع أسرة (producer_id) أو مع مندوب (courier_id، طرف «الأسرة» نفسه).
 * $1 = المستخدم الحالي.
 */
const COUNTERPART_JOINS = `LEFT JOIN jdatna.producer_profiles p ON p.id=c.producer_id
       LEFT JOIN jdatna.courier_profiles kp ON kp.user_id=c.courier_id
       JOIN jdatna.users u ON u.id=c.customer_id`;
const KIND_SQL = `CASE WHEN c.courier_id=$1 THEN 'customer'
        WHEN c.customer_id=$1 AND c.courier_id IS NOT NULL THEN 'courier'
        WHEN c.customer_id=$1 THEN 'family'
        WHEN u.role='courier' THEN 'courier' ELSE 'customer' END`;
// اسم العميل لا يظهر للأسرة إن بدأت هي المحادثة من «طلب عميل» لم يوافق صاحبه على إظهار اسمه،
// حتى يطلب منها (فالطلب يحمل اسمه). مراجعة أمنية 2026-11-24.
const TITLE_SQL = `CASE WHEN c.customer_id=$1 THEN COALESCE(p.trade_name,p.name,kp.name)
        WHEN c.anonymous_customer AND NOT EXISTS(SELECT 1 FROM jdatna.order_requests ao
          WHERE ao.user_id=c.customer_id AND ao.producer_id=c.producer_id) THEN 'عميل'
        ELSE u.name END`;
const VOICE_COLUMNS = `m.id,m.body,m.sender_id=$2 AS mine,m.created_at AS "createdAt",v.duration_ms AS "voiceMs"`;

/**
 * يبدأ محادثة أو يعيد القائمة:
 * - العميل مع أسرة معتمدة (من صفحتها أو من طلبه)، والأسرة مع صاحب الطلب.
 * - الأسرة مع مندوب معتمد للاتفاق على التوصيل (المندوب في طرف «العميل»).
 * - العميل مع مندوب عام معتمد نشط من «تجمع المندوبين» (المندوب الخاص لأسرته فقط).
 * - مندوب الطلب مع عميله، والعميل مع مندوب طلبه (عام أو خاص) من الطلب: { delivery }.
 */
export async function startConversation(user: SessionUser, input: unknown) {
  const parsed = z
    .union([
      z.object({ producer: z.string().min(1).max(200) }).strict(),
      z.object({ order: z.uuid() }).strict(),
      z.object({ courier: z.uuid() }).strict(),
      z.object({ delivery: z.uuid() }).strict(),
      // أسرة تراسل صاحب «طلب عميل» مفتوح.
      z.object({ request: z.uuid() }).strict(),
    ])
    .parse(input);
  let customerId: string,
    producerId: string | null = null,
    courierId: string | null = null,
    anonymous = false;
  if ("request" in parsed) {
    const family = (
      await db().query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
        [user.id],
      )
    ).rows[0] as { id: string } | undefined;
    if (!family)
      throw new HttpError(403, "مراسلة أصحاب الطلبات للأسر المنتجة المعتمدة");
    const req = (
      await db().query(
        `SELECT r.user_id,r.show_name FROM jdatna.customer_requests r JOIN jdatna.users u ON u.id=r.user_id
         WHERE r.id=$1 AND r.status='open' AND r.expires_at>now() AND u.suspended_at IS NULL AND u.deleted_at IS NULL`,
        [parsed.request],
      )
    ).rows[0] as { user_id: string; show_name: boolean } | undefined;
    if (!req) throw new HttpError(404, "الطلب لم يعد مفتوحًا");
    if (req.user_id === user.id)
      throw new HttpError(400, "لا يمكنك مراسلة نفسك");
    // حساب مراجعة المتاجر لا يصل لعملاء حقيقيين، ولا العكس.
    const { assertReviewPair } = await import("./store-review");
    await assertReviewPair(db(), req.user_id, family.id);
    customerId = req.user_id;
    producerId = family.id;
    anonymous = !req.show_name;
  } else if ("delivery" in parsed) {
    // مندوب الطلب وعميله فقط، ما دام التوصيل لم يكتمل أو اكتمل حديثًا.
    const row = (
      await db().query(
        `SELECT o.user_id,oc.courier_user_id FROM jdatna.order_couriers oc
         JOIN jdatna.order_requests o ON o.id=oc.order_id
         WHERE oc.order_id=$1 AND (o.user_id=$2 OR oc.courier_user_id=$2)
           AND o.status NOT IN ('declined','cancelled')`,
        [parsed.delivery, user.id],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "لا يوجد مندوب لهذا الطلب");
    if (!row.user_id)
      throw new HttpError(400, "طلب الضيف بلا حساب؛ تواصل معه بالجوال");
    if (row.user_id === row.courier_user_id)
      throw new HttpError(400, "لا يمكنك مراسلة نفسك");
    const { assertReviewUsers } = await import("./store-review");
    await assertReviewUsers(db(), row.user_id, row.courier_user_id);
    customerId = row.user_id;
    courierId = row.courier_user_id;
  } else if ("courier" in parsed) {
    const family = (
      await db().query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
        [user.id],
      )
    ).rows[0] as { id: string } | undefined;
    const courier = (
      await db().query(
        `SELECT k.user_id,k.family_id,k.active FROM jdatna.courier_profiles k JOIN jdatna.users u ON u.id=k.user_id
         WHERE k.user_id=$1 AND k.status='approved' AND u.suspended_at IS NULL AND u.deleted_at IS NULL`,
        [parsed.courier],
      )
    ).rows[0] as
      | { user_id: string; family_id: string | null; active: boolean }
      | undefined;
    // حساب مراجعة المتاجر لا يصل لمندوب حقيقي، ولا العكس.
    if (courier) {
      const { assertReviewUsers } = await import("./store-review");
      await assertReviewUsers(db(), user.id, courier.user_id);
    }
    if (family) {
      if (!courier) throw new HttpError(404, "المندوب غير متاح");
      // الأسرة مع المندوب: المندوب في طرف «العميل».
      customerId = courier.user_id;
      producerId = family.id;
    } else {
      if (user.role === "courier")
        throw new HttpError(403, "المندوب يراسل العميل من طلب التوصيل");
      // العميل مع مندوب عام نشط؛ المندوب الخاص لأسرته فقط.
      if (!courier || courier.family_id || !courier.active)
        throw new HttpError(404, "المندوب غير متاح");
      if (courier.user_id === user.id)
        throw new HttpError(400, "لا يمكنك مراسلة نفسك");
      customerId = user.id;
      courierId = courier.user_id;
    }
  } else if ("order" in parsed) {
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
    const { assertReviewPair } = await import("./store-review");
    await assertReviewPair(db(), user.id, family.id);
    customerId = user.id;
    producerId = family.id;
  }
  // محادثة حُذفت ثم بدأها أحدهما من جديد: تعود فارغة للطرفين (السابق للإدارة فقط).
  const reopen = `customer_id=EXCLUDED.customer_id,
         visible_from=CASE WHEN jdatna.conversations.deleted_at IS NOT NULL THEN now() ELSE jdatna.conversations.visible_from END,
         deleted_at=NULL,deleted_by=NULL`;
  const row = (
    await db().query(
      courierId
        ? `INSERT INTO jdatna.conversations(id,customer_id,courier_id) VALUES($1,$2,$3)
           ON CONFLICT(customer_id,courier_id) WHERE courier_id IS NOT NULL DO UPDATE SET ${reopen}
           RETURNING id`
        : // محادثة قائمة تبقى كما هي (الاسم معروف فيها من قبل)؛ الجديدة من طلب بلا اسم تبدأ مجهولة.
          `INSERT INTO jdatna.conversations(id,customer_id,producer_id,anonymous_customer) VALUES($1,$2,$3,$4)
           ON CONFLICT(customer_id,producer_id) DO UPDATE SET ${reopen}
           RETURNING id`,
      courierId
        ? [randomUUID(), customerId, courierId]
        : [randomUUID(), customerId, producerId, anonymous],
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
      // محادثاتي كعميل ومحادثات أسرتي، كل جهة بفهرسها (بدل OR يمسح الجدول كله)، بلا المحذوفة.
      `WITH mine AS (
         SELECT c.id FROM jdatna.conversations c WHERE c.customer_id=$1 AND c.deleted_at IS NULL
         UNION
         SELECT c.id FROM jdatna.conversations c JOIN jdatna.producer_profiles p ON p.id=c.producer_id
          WHERE p.user_id=$1 AND c.deleted_at IS NULL
         UNION
         SELECT c.id FROM jdatna.conversations c WHERE c.courier_id=$1 AND c.deleted_at IS NULL
       )
       SELECT c.id,
        CASE WHEN c.customer_id=$1 THEN 'customer' ELSE 'producer' END AS side,
        ${KIND_SQL} AS kind,
        ${TITLE_SQL} AS title,
        (SELECT m.body FROM jdatna.messages m WHERE m.conversation_id=c.id
          AND m.created_at>=COALESCE(c.visible_from,'-infinity') ORDER BY m.created_at DESC LIMIT 1) AS preview,
        c.last_message_at AS "lastAt",
        (SELECT count(*)::int FROM jdatna.messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1
          AND m.created_at>=COALESCE(c.visible_from,'-infinity')
          AND m.created_at > CASE WHEN c.customer_id=$1 THEN c.customer_read_at ELSE c.producer_read_at END) AS unread
       FROM mine JOIN jdatna.conversations c ON c.id=mine.id
       ${COUNTERPART_JOINS}
       ORDER BY c.last_message_at DESC LIMIT 100`,
      [user.id],
    )
  ).rows;
}

/**
 * وصلت رسائل الطرف الآخر لجهاز المستخدم (✓✓ رمادي عند المرسل): يُسجَّل عند كل فحص
 * من التطبيق المفتوح أو عند عرض قائمة المحادثات.
 */
export async function markDelivered(user: SessionUser) {
  // يكتب فقط حين وصل جديد بعد آخر استلام، لا مع كل فحص دوري.
  await Promise.all([
    db().query(
      "UPDATE jdatna.conversations SET customer_delivered_at=now() WHERE customer_id=$1 AND customer_delivered_at<last_message_at",
      [user.id],
    ),
    db().query(
      `UPDATE jdatna.conversations c SET producer_delivered_at=now()
       FROM jdatna.producer_profiles p WHERE p.id=c.producer_id AND p.user_id=$1 AND c.producer_delivered_at<c.last_message_at`,
      [user.id],
    ),
    // المندوب في طرف «الأسرة» من محادثة العميل معه.
    db().query(
      "UPDATE jdatna.conversations SET producer_delivered_at=now() WHERE courier_id=$1 AND producer_delivered_at<last_message_at",
      [user.id],
    ),
  ]);
}

/** تنبيه الرسائل الجديدة: مجموع غير المقروء وأحدث المحادثات التي فيها جديد. */
export async function unreadConversations(user: SessionUser) {
  const [, all] = await Promise.all([
    markDelivered(user),
    listConversations(user),
  ]);
  const unread = all.filter((c) => c.unread > 0);
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
export async function participant(
  client: Pick<PoolClient, "query">,
  user: SessionUser,
  id: string,
  lock = false,
) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "المحادثة غير موجودة");
  const row = (
    await client.query(
      `SELECT c.id,c.customer_id,COALESCE(p.user_id,c.courier_id) AS producer_user,c.blocked_by,c.producer_id,
        c.customer_read_at,c.producer_read_at,c.customer_delivered_at,c.producer_delivered_at,
        ${TITLE_SQL} AS title,${KIND_SQL} AS kind,
        p.slug AS "producerSlug",COALESCE(c.visible_from,'-infinity') AS visible_from
       FROM jdatna.conversations c
       ${COUNTERPART_JOINS}
       WHERE c.id=$2 AND c.deleted_at IS NULL AND (c.customer_id=$1 OR p.user_id=$1 OR c.courier_id=$1)${lock ? " FOR UPDATE OF c" : ""}`,
      [user.id, id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "المحادثة غير موجودة");
  const side: "customer" | "producer" =
    row.customer_id === user.id ? "customer" : "producer";
  return { ...row, side } as {
    id: string;
    customer_id: string;
    producer_user: string;
    title: string;
    kind: Counterpart;
    producerSlug: string | null;
    side: "customer" | "producer";
    blocked_by: string | null;
    producer_id: string | null;
    customer_read_at: Date;
    producer_read_at: Date;
    customer_delivered_at: Date;
    producer_delivered_at: Date;
    visible_from: Date | string;
  };
}

/**
 * رسائل المحادثة (الأحدث 200، أو ما بعد وقت معيّن للتحديث)، وتعليمها مقروءة.
 * read=false: الصفحة مخفية، فتُجلب الرسائل دون تعليمها مقروءة.
 */
export async function conversationMessages(
  user: SessionUser,
  id: string,
  after?: string,
  read = true,
) {
  const since =
    after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  return transaction(async (client) => {
    const c = await participant(client, user, id);
    const rows = (
      await client.query(
        since
          ? `SELECT ${VOICE_COLUMNS} FROM jdatna.messages m LEFT JOIN jdatna.message_voice v ON v.message_id=m.id
             WHERE m.conversation_id=$1 AND m.created_at>=$3 AND m.created_at>$4 ORDER BY m.created_at LIMIT 200`
          : `SELECT * FROM (SELECT ${VOICE_COLUMNS} FROM jdatna.messages m LEFT JOIN jdatna.message_voice v ON v.message_id=m.id
             WHERE m.conversation_id=$1 AND m.created_at>=$3 ORDER BY m.created_at DESC LIMIT 200) x ORDER BY "createdAt"`,
        since
          ? [c.id, user.id, c.visible_from, since]
          : [c.id, user.id, c.visible_from],
      )
    ).rows as ChatMessage[];
    // فتح المحادثة = قراءة واستلام (✓✓ أزرق عند الطرف الآخر)، حتى آخر رسالة عُرضت فعلًا.
    const raw = c as unknown as { customer_id: string; producer_user: string };
    const otherUser =
      c.side === "customer" ? raw.producer_user : raw.customer_id;
    const seenUpTo = rows.at(-1)?.createdAt;
    const readAt = c[`${c.side}_read_at`];
    if (
      read &&
      seenUpTo &&
      new Date(seenUpTo).getTime() > new Date(readAt).getTime()
    ) {
      const newlyRead = rows.some(
        (m) =>
          !m.mine &&
          new Date(m.createdAt).getTime() > new Date(readAt).getTime(),
      );
      // وقت القراءة بدقة القاعدة (ميكروثانية) من الرسائل المعروضة نفسها، لا من وقت جافاسكربت المقرَّب.
      await client.query(
        `UPDATE jdatna.conversations SET ${c.side}_read_at=GREATEST(${c.side}_read_at,m.at),${c.side}_delivered_at=GREATEST(${c.side}_delivered_at,m.at)
         FROM (SELECT max(created_at) AS at FROM jdatna.messages WHERE id=ANY($2::uuid[])) m WHERE id=$1`,
        [c.id, rows.map((r) => r.id)],
      );
      if (newlyRead)
        await publishLive([otherUser], { type: "read", c: c.id }, client);
    }
    const other = c.side === "customer" ? "producer" : "customer";
    return {
      conversation: {
        id: c.id,
        title: c.title,
        side: c.side,
        kind: c.kind,
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
  return deliver(user, id, body, null);
}

/** نوع الملف من بايتاته الأولى، لا من اسمه أو مما يقوله المتصفح. */
export function voiceMime(data: Uint8Array): string | null {
  if (
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  )
    return "audio/webm";
  if (String.fromCharCode(...data.subarray(0, 4)) === "OggS")
    return "audio/ogg";
  if (String.fromCharCode(...data.subarray(4, 8)) === "ftyp")
    return "audio/mp4";
  return null;
}

const clock = (ms: number) => {
  const total = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** رسالة صوتية: تسجيل من المتصفح حتى دقيقتين، يُحفظ في القاعدة ويصل لطرفي المحادثة فقط. */
export async function sendVoice(
  user: SessionUser,
  id: string,
  data: Uint8Array,
  durationValue: unknown,
) {
  const durationMs = z.coerce
    .number()
    .int()
    .min(500, "التسجيل قصير جدًا")
    .max(VOICE_MAX_MS + 500, "الحد الأقصى للتسجيل دقيقتان")
    .parse(durationValue);
  if (data.byteLength < 100) throw new HttpError(400, "التسجيل فارغ");
  if (data.byteLength > VOICE_MAX_BYTES)
    throw new HttpError(413, "التسجيل أكبر من المسموح");
  const mime = voiceMime(data);
  if (!mime) throw new HttpError(400, "صيغة التسجيل غير مدعومة");
  return deliver(user, id, `🎤 رسالة صوتية (${clock(durationMs)})`, {
    mime,
    durationMs,
    data,
  });
}

async function deliver(
  user: SessionUser,
  id: string,
  body: string,
  voice: { mime: string; durationMs: number; data: Uint8Array } | null,
) {
  const sent = await transaction(async (client) => {
    const c = await participant(client, user, id, true);
    if (c.blocked_by)
      throw new HttpError(
        403,
        c.blocked_by === user.id
          ? "حظرت هذه المحادثة؛ ألغِ الحظر لترسل"
          : "لا يمكن الإرسال في هذه المحادثة",
      );
    // محادثة قائمة بين حساب مراجعة المتاجر وحساب حقيقي (قبل عزل المندوبين): لا إرسال فيها.
    const mixed = (
      await client.query(
        `SELECT 1 FROM jdatna.conversations c
           JOIN jdatna.users cu ON cu.id=c.customer_id
           LEFT JOIN jdatna.producer_profiles p ON p.id=c.producer_id
           LEFT JOIN jdatna.users ou ON ou.id=COALESCE(p.user_id,c.courier_id)
          WHERE c.id=$1 AND ou.id IS NOT NULL AND cu.review_account<>ou.review_account`,
        [c.id],
      )
    ).rowCount;
    if (mixed) throw new HttpError(403, "لا يمكن الإرسال في هذه المحادثة");
    const message = (
      await client.query(
        `INSERT INTO jdatna.messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)
         RETURNING id,body,true AS mine,created_at AS "createdAt"`,
        [randomUUID(), c.id, user.id, body],
      )
    ).rows[0] as ChatMessage;
    message.voiceMs = null;
    if (voice) {
      await client.query(
        "INSERT INTO jdatna.message_voice(message_id,mime,duration_ms,data) VALUES($1,$2,$3,$4)",
        [message.id, voice.mime, voice.durationMs, Buffer.from(voice.data)],
      );
      message.voiceMs = voice.durationMs;
    }
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
  // تصل الرسالة لحظيًا للطرفين (وأي نافذة أخرى مفتوحة للمرسل).
  void publishLive([sent.to, user.id], {
    type: "message",
    c: sent.conversation,
  });
  // إشعار الجوال للطرف الآخر بعد حفظ الرسالة، دون انتظار يؤخر المرسل.
  void notifyUser(sent.to, {
    title: await msg("msg.chat.title", { name: user.name }),
    body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
    url: `/messages?c=${sent.conversation}`,
    tag: `chat-${sent.conversation}`,
  });
  return sent.message;
}

/** صوت رسالة في محادثة: لطرفيها فقط؛ غيرهما يرى «غير موجودة». */
export async function voiceOf(
  user: SessionUser,
  conversationId: string,
  messageId: string,
) {
  const c = await participant(db(), user, conversationId);
  if (!z.uuid().safeParse(messageId).success)
    throw new HttpError(404, "الرسالة غير موجودة");
  const row = (
    await db().query(
      `SELECT v.mime,v.data FROM jdatna.message_voice v JOIN jdatna.messages m ON m.id=v.message_id
       WHERE v.message_id=$1 AND m.conversation_id=$2 AND m.created_at>=$3`,
      [messageId, c.id, c.visible_from],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "الرسالة غير موجودة");
  return { mime: row.mime as string, data: row.data as Buffer };
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
        // المبلَّغ عنه هو الطرف الآخر في المحادثة، لتراه الإدارة باسمه.
        "INSERT INTO jdatna.reports(id,reporter_id,producer_id,reason,reported_user_id) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          user.id,
          c.producer_id,
          `بلاغ محادثة (${c.id}) مع ${c.kind === "family" ? "أسرة" : c.kind === "courier" ? "مندوب" : "عميل"}: ${value.reason}`,
          c.side === "customer" ? c.producer_user : c.customer_id,
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

/**
 * حذف المحادثة: تختفي من الطرفين (القائمة والرسائل والإشعارات)، وتبقى كاملة للإدارة.
 * إن بدأها أحدهما من جديد عادت فارغة للطرفين.
 */
export async function deleteConversation(user: SessionUser, id: string) {
  const done = await transaction(async (client) => {
    const c = await participant(client, user, id, true);
    await client.query(
      "INSERT INTO jdatna.conversation_deletions(id,conversation_id,deleted_by,visible_from) VALUES($1,$2,$3,$4)",
      [randomUUID(), c.id, user.id, c.visible_from],
    );
    await client.query(
      "UPDATE jdatna.conversations SET deleted_at=now(),deleted_by=$2 WHERE id=$1",
      [c.id, user.id],
    );
    const raw = c as unknown as { customer_id: string; producer_user: string };
    return { id: c.id, users: [raw.customer_id, raw.producer_user] };
  });
  // تختفي فورًا من قائمة الطرف الآخر وأي نافذة مفتوحة.
  void publishLive(done.users, { type: "message", c: done.id });
  return { deleted: true };
}

/**
 * رسالة من النظام في محادثة (الاشتراكات): إن كانت المحادثة محذوفة تُستأنف فارغة للطرفين
 * قبل الإرسال، كما لو بدأها أحدهما من جديد.
 */
export async function reopenConversation(id: string) {
  await db().query(
    "UPDATE jdatna.conversations SET deleted_at=NULL,deleted_by=NULL,visible_from=now() WHERE id=$1 AND deleted_at IS NOT NULL",
    [id],
  );
}

/** الإدارة ← «المحادثات المحذوفة»: لصلاحية البلاغات. */
export async function adminDeletedConversations(user: SessionUser) {
  if (!can(user, "deleted-chats"))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  return (
    await db().query(
      `SELECT d.id,d.conversation_id AS "conversationId",d.deleted_at AS "deletedAt",
         du.name AS "deletedBy",u.name AS "customerName",
         COALESCE(p.trade_name,p.name,'المندوب: '||kp.name) AS "familyName",
         (SELECT count(*)::int FROM jdatna.messages m WHERE m.conversation_id=c.id
           AND m.created_at>=COALESCE(d.visible_from,'-infinity') AND m.created_at<=d.deleted_at) AS messages
       FROM jdatna.conversation_deletions d
       JOIN jdatna.conversations c ON c.id=d.conversation_id
       LEFT JOIN jdatna.producer_profiles p ON p.id=c.producer_id
       LEFT JOIN jdatna.courier_profiles kp ON kp.user_id=c.courier_id
       JOIN jdatna.users u ON u.id=c.customer_id
       LEFT JOIN jdatna.users du ON du.id=d.deleted_by
       ORDER BY d.deleted_at DESC LIMIT 200`,
    )
  ).rows as {
    id: string;
    conversationId: string;
    deletedAt: string;
    deletedBy: string | null;
    customerName: string;
    familyName: string;
    messages: number;
  }[];
}

/** نص محادثة محذوفة كما كانت لحظة الحذف، للإدارة فقط. */
export async function adminDeletedTranscript(
  user: SessionUser,
  deletionId: string,
) {
  if (!can(user, "deleted-chats"))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  if (!z.uuid().safeParse(deletionId).success)
    throw new HttpError(404, "المحادثة غير موجودة");
  const d = (
    await db().query(
      `SELECT d.conversation_id,d.visible_from,d.deleted_at,c.customer_id
       FROM jdatna.conversation_deletions d JOIN jdatna.conversations c ON c.id=d.conversation_id WHERE d.id=$1`,
      [deletionId],
    )
  ).rows[0];
  if (!d) throw new HttpError(404, "المحادثة غير موجودة");
  return (
    await db().query(
      `SELECT m.id,m.body,m.created_at AS "createdAt",u.name AS sender,
         m.sender_id=$4 AS customer,v.duration_ms AS "voiceMs"
       FROM jdatna.messages m JOIN jdatna.users u ON u.id=m.sender_id
       LEFT JOIN jdatna.message_voice v ON v.message_id=m.id
       WHERE m.conversation_id=$1 AND m.created_at>=COALESCE($2::timestamptz,'-infinity') AND m.created_at<=$3
       ORDER BY m.created_at LIMIT 2000`,
      [d.conversation_id, d.visible_from, d.deleted_at, d.customer_id],
    )
  ).rows as {
    id: string;
    body: string;
    createdAt: string;
    sender: string;
    customer: boolean;
    voiceMs: number | null;
  }[];
}

/** صوت رسالة في محادثة محذوفة، للإدارة فقط. */
export async function adminVoice(user: SessionUser, messageId: string) {
  if (!can(user, "deleted-chats"))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  if (!z.uuid().safeParse(messageId).success)
    throw new HttpError(404, "الرسالة غير موجودة");
  const row = (
    await db().query(
      // صوت المحادثات المحذوفة فقط؛ المحادثات القائمة خاصة بطرفيها.
      `SELECT v.mime,v.data FROM jdatna.message_voice v JOIN jdatna.messages m ON m.id=v.message_id
       WHERE v.message_id=$1 AND EXISTS(SELECT 1 FROM jdatna.conversation_deletions d
         WHERE d.conversation_id=m.conversation_id AND m.created_at<=d.deleted_at
           AND m.created_at>=COALESCE(d.visible_from,'-infinity'))`,
      [messageId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "الرسالة غير موجودة");
  return { mime: row.mime as string, data: row.data as Buffer };
}
