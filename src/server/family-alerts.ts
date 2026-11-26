import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { SITE_URL } from "../lib/seo";
import type { SiteTexts } from "../lib/site-texts";
import { db, databaseConfigured, transaction } from "./db";
import { HttpError } from "./security";

/**
 * «تنبيهات الأسرة» (طلب المالك 2026-11-26): العضو يتابع أسرة بموافقة صريحة، فيصله تنبيه حين تضيف
 * منتجًا جديدًا أو يبدأ توزيع منتج مجدول. الحماية: حد يومي لكل عضو، ولا تكرار للمنتج والحدث نفسه،
 * والدفعة الكبيرة تنبيه واحد (مهلة تجميع)، ورابط إلغاء في كل تنبيه.
 * القنوات: صندوق «تنبيهاتي» داخل الموقع دائمًا، وإشعار الجوال/المتصفح المجاني الموجود (push).
 * قناة واتساب تُضاف لاحقًا في ALERT_CHANNELS بمفتاح من لوحة الإدارة (لا تُرسل الآن).
 */

/** الافتراضي للحد اليومي؛ الإدارة تغيّره من «تطبيق الجوال ← تنبيهات الأسرة» (1 إلى 100). */
export const ALERT_DAILY_LIMIT = 10;
const LIMIT_KEY = "alerts:dailyLimit";

/** الحد اليومي الحالي: إعداد الإدارة، وإلا الافتراضي. أي خطأ في القراءة يعيد الافتراضي. */
export async function getAlertDailyLimit(): Promise<number> {
  if (!databaseConfigured()) return ALERT_DAILY_LIMIT;
  try {
    const v = Number(
      (
        await db().query<{ value: string }>(
          "SELECT value FROM jdatna.site_settings WHERE key=$1",
          [LIMIT_KEY],
        )
      ).rows[0]?.value,
    );
    return Number.isInteger(v) && v >= 1 && v <= 100 ? v : ALERT_DAILY_LIMIT;
  } catch {
    return ALERT_DAILY_LIMIT;
  }
}

/** الإدارة (صلاحية «تطبيق الجوال»): تغيير الحد اليومي، مسجّلًا في سجل النشاطات. */
export async function setAlertDailyLimit(user: SessionUser, input: unknown) {
  const { can } = await import("../lib/permissions");
  if (!can(user, "app")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const { dailyLimit } = z
    .object({ dailyLimit: z.number().int().min(1).max(100) })
    .strict()
    .parse(input);
  await transaction(async (c) => {
    await c.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [LIMIT_KEY, String(dailyLimit), user.id],
    );
    await c.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.alerts',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ dailyLimit })],
    );
  });
  return { dailyLimit };
}
/** مهلة تجميع الدفعة: الأحداث الأحدث منها تنتظر الدورة التالية. */
export const ALERT_GRACE_SECONDS = 120;
const TODAY = `(now() AT TIME ZONE 'Asia/Riyadh')::date`;

/* ───────── القنوات ───────── */
export type AlertMessage = {
  userId: string;
  producerId: string;
  title: string;
  body: string;
  url: string;
  tag: string;
};
export type AlertChannel = {
  key: string;
  /** القناة مفعّلة ومهيأة (مفتاحها موجود). */
  enabled: () => Promise<boolean> | boolean;
  send: (m: AlertMessage) => Promise<unknown>;
};
/** إشعار الجوال والمتصفح (Web Push وApple) الموجود؛ مجاني. */
const pushChannel: AlertChannel = {
  key: "push",
  enabled: () => true,
  send: async (m) => {
    const { notifyUser } = await import("./push");
    await notifyUser(m.userId, {
      title: m.title,
      body: m.body,
      url: m.url,
      tag: m.tag,
    });
  },
};
/**
 * واتساب (لاحقًا): يُفعَّل حين يضع المالك مفتاح واتساب للأعمال من لوحة الإدارة. معطل الآن عمدًا
 * (قرار المالك 2026-11-26)؛ الإضافة لاحقًا تكون بتنفيذ send هنا دون تغيير المرسِل.
 */
const whatsappChannel: AlertChannel = {
  key: "whatsapp",
  enabled: () => false,
  send: async () => {},
};
/** القنوات الخارجية. صندوق «تنبيهاتي» داخل الموقع يُكتب دائمًا مع الإرسال (ومنه الحد اليومي). */
export const ALERT_CHANNELS: AlertChannel[] = [pushChannel, whatsappChannel];
let channelOverride: AlertChannel[] | null = null;
/** للاختبارات: قنوات بديلة تسجل ما يُرسل. */
export function setAlertChannels(c: AlertChannel[] | null) {
  channelOverride = c;
}

/* ───────── المتابعة ───────── */
const followSchema = z
  .object({
    producer: z.string().min(1).max(200),
    notifyNew: z.boolean(),
    notifySchedule: z.boolean(),
    scope: z.enum(["all", "selected"]),
    productIds: z.array(z.uuid()).max(100).default([]),
    /** موافقة صريحة على الاستلام: لا متابعة بدونها. */
    consent: z.literal(true),
  })
  .strict();

/** رسائل الأخطاء من «نصوص الموقع». */
async function t() {
  return (await import("./settings")).getSiteTexts();
}

async function approvedProducer(slug: string) {
  const row = (
    await db().query<{ id: string; userId: string; name: string }>(
      `SELECT id,user_id AS "userId",COALESCE(trade_name,name) AS name FROM jdatna.producer_profiles WHERE slug=$1 AND status='approved' AND NOT review_only`,
      [slug],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, (await t())["alerts.errFamily"]);
  return row;
}

export type Follow = {
  producerSlug: string;
  producerName: string;
  notifyNew: boolean;
  notifySchedule: boolean;
  scope: "all" | "selected";
  productIds: string[];
  paused: boolean;
};
const followSelect = `SELECT p.slug AS "producerSlug",COALESCE(p.trade_name,p.name) AS "producerName",
  f.notify_new AS "notifyNew",f.notify_schedule AS "notifySchedule",f.scope,f.paused,
  COALESCE((SELECT array_agg(fp.product_id::text ORDER BY fp.product_id) FROM jdatna.family_follow_products fp
    WHERE fp.user_id=f.user_id AND fp.producer_id=f.producer_id),'{}') AS "productIds"
  FROM jdatna.family_follows f JOIN jdatna.producer_profiles p ON p.id=f.producer_id`;

export async function myFollows(user: SessionUser): Promise<Follow[]> {
  return (
    await db().query<Follow>(
      `${followSelect} WHERE f.user_id=$1 ORDER BY f.created_at DESC`,
      [user.id],
    )
  ).rows;
}
export async function myFollow(user: SessionUser, slug: string) {
  return (
    (
      await db().query<Follow>(
        `${followSelect} WHERE f.user_id=$1 AND p.slug=$2`,
        [user.id, slug],
      )
    ).rows[0] ?? null
  );
}

/** متابعة أسرة أو تعديلها (بالموافقة الصريحة كل مرة). */
export async function saveFollow(user: SessionUser, input: unknown) {
  const v = followSchema.parse(input);
  const texts = await t();
  if (!v.notifyNew && !v.notifySchedule)
    throw new HttpError(400, texts["alerts.errKind"]);
  if (v.scope === "selected" && !v.productIds.length)
    throw new HttpError(400, texts["alerts.errProducts"]);
  const producer = await approvedProducer(v.producer);
  if (producer.userId === user.id)
    throw new HttpError(400, texts["alerts.errOwn"]);
  return transaction(async (c) => {
    // المنتجات المختارة من منتجات هذه الأسرة الظاهرة فقط.
    const products =
      v.scope === "selected"
        ? (
            await c.query<{ id: string }>(
              "SELECT id FROM jdatna.products WHERE id=ANY($1::uuid[]) AND producer_id=$2 AND visible AND deleted_at IS NULL",
              [v.productIds, producer.id],
            )
          ).rows.map((r) => r.id)
        : [];
    if (v.scope === "selected" && !products.length)
      throw new HttpError(400, texts["alerts.errProducts"]);
    await c.query(
      `INSERT INTO jdatna.family_follows(user_id,producer_id,notify_new,notify_schedule,scope,consented_at,unsubscribe_token)
       VALUES($1,$2,$3,$4,$5,now(),$6)
       ON CONFLICT(user_id,producer_id) DO UPDATE SET notify_new=EXCLUDED.notify_new,notify_schedule=EXCLUDED.notify_schedule,
         scope=EXCLUDED.scope,consented_at=now(),paused=false`,
      [
        user.id,
        producer.id,
        v.notifyNew,
        v.notifySchedule,
        v.scope,
        randomBytes(24).toString("hex"),
      ],
    );
    await c.query(
      "DELETE FROM jdatna.family_follow_products WHERE user_id=$1 AND producer_id=$2",
      [user.id, producer.id],
    );
    if (products.length)
      await c.query(
        "INSERT INTO jdatna.family_follow_products(user_id,producer_id,product_id) SELECT $1,$2,unnest($3::uuid[])",
        [user.id, producer.id, products],
      );
    return { following: true };
  });
}

/** إيقاف مؤقت أو استئناف أو إلغاء متابعة أسرة. */
export async function changeFollow(user: SessionUser, input: unknown) {
  const v = z
    .object({
      producer: z.string().min(1).max(200),
      action: z.enum(["pause", "resume", "cancel"]),
    })
    .strict()
    .parse(input);
  const producer = await approvedProducer(v.producer).catch(() => null);
  const id =
    producer?.id ??
    (
      await db().query<{ id: string }>(
        "SELECT id FROM jdatna.producer_profiles WHERE slug=$1",
        [v.producer],
      )
    ).rows[0]?.id;
  if (!id) throw new HttpError(404, (await t())["alerts.errFamily"]);
  if (v.action === "cancel")
    await db().query(
      "DELETE FROM jdatna.family_follows WHERE user_id=$1 AND producer_id=$2",
      [user.id, id],
    );
  else
    await db().query(
      "UPDATE jdatna.family_follows SET paused=$3 WHERE user_id=$1 AND producer_id=$2",
      [user.id, id, v.action === "pause"],
    );
  return { ok: true };
}

/** الإلغاء من الرابط في التنبيه (بلا دخول): الرمز خاص بمتابعة واحدة. */
export async function unsubscribeByToken(input: unknown) {
  const { token } = z
    .object({ token: z.string().regex(/^[a-f0-9]{48}$/) })
    .strict()
    .parse(input);
  const removed = await db().query(
    "DELETE FROM jdatna.family_follows WHERE unsubscribe_token=$1",
    [token],
  );
  return { unsubscribed: (removed.rowCount ?? 0) > 0 };
}

/** الأسرة ترى عدد متابعيها فقط، لا هوياتهم. */
export async function myFollowerCount(user: SessionUser) {
  return (
    await db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM jdatna.family_follows f JOIN jdatna.producer_profiles p ON p.id=f.producer_id
       WHERE p.user_id=$1 AND NOT f.paused`,
      [user.id],
    )
  ).rows[0].n;
}

export async function myInbox(user: SessionUser) {
  const rows = (
    await db().query(
      `SELECT id,title,body,url,created_at AS "createdAt",read_at IS NOT NULL AS read FROM jdatna.member_alerts
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    )
  ).rows;
  await db().query(
    "UPDATE jdatna.member_alerts SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
    [user.id],
  );
  return rows;
}

/* ───────── جدول التوزيع (لوحة الأسرة) ───────── */
const scheduleSchema = z
  .object({
    productId: z.uuid(),
    kind: z.enum(["daily", "weekly", "date"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    startsOn: z.iso.date(),
  })
  .strict();

async function familyOf(user: SessionUser) {
  const row = (
    await db().query<{ id: string }>(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(403, (await t())["schedule.errFamily"]);
  return row.id;
}

export async function mySchedules(user: SessionUser) {
  const producerId = await familyOf(user);
  const [schedules, products, followers] = await Promise.all([
    db().query(
      `SELECT s.id,s.product_id AS "productId",x.name AS "productName",s.kind,s.weekdays,to_char(s.starts_on,'YYYY-MM-DD') AS "startsOn",
         s.announced_at IS NOT NULL AS announced
       FROM jdatna.product_schedules s JOIN jdatna.products x ON x.id=s.product_id
       WHERE s.producer_id=$1 AND x.deleted_at IS NULL ORDER BY s.starts_on DESC,s.created_at DESC`,
      [producerId],
    ),
    db().query(
      "SELECT id,name FROM jdatna.products WHERE producer_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200",
      [producerId],
    ),
    myFollowerCount(user),
  ]);
  return {
    schedules: schedules.rows,
    products: products.rows,
    followers,
  };
}

export async function addSchedule(user: SessionUser, input: unknown) {
  const v = scheduleSchema.parse(input);
  if (v.kind === "weekly" && !v.weekdays.length)
    throw new HttpError(400, (await t())["schedule.errDays"]);
  const producerId = await familyOf(user);
  const owned = (
    await db().query(
      "SELECT 1 FROM jdatna.products WHERE id=$1 AND producer_id=$2 AND deleted_at IS NULL",
      [v.productId, producerId],
    )
  ).rowCount;
  if (!owned) throw new HttpError(404, (await t())["schedule.errProduct"]);
  const id = randomUUID();
  await db().query(
    `INSERT INTO jdatna.product_schedules(id,product_id,producer_id,kind,weekdays,starts_on)
     VALUES($1,$2,$3,$4,$5::smallint[],$6)`,
    [
      id,
      v.productId,
      producerId,
      v.kind,
      v.kind === "weekly" ? [...new Set(v.weekdays)].sort() : [],
      v.startsOn,
    ],
  );
  // جدول يبدأ اليوم أو قبله: يُعلن في الدورة القادمة (بعد مهلة التجميع).
  scheduleDispatch();
  return { id };
}

export async function removeSchedule(user: SessionUser, input: unknown) {
  const { id } = z.object({ id: z.uuid() }).strict().parse(input);
  const producerId = await familyOf(user);
  await db().query(
    "DELETE FROM jdatna.product_schedules WHERE id=$1 AND producer_id=$2",
    [id, producerId],
  );
  return { ok: true };
}

/** جداول المنتج للعرض في صفحته. */
export async function productSchedules(productId: string) {
  if (!databaseConfigured() || !/^[a-f0-9-]{36}$/i.test(productId)) return [];
  return (
    await db().query<{ kind: string; weekdays: number[]; startsOn: string }>(
      `SELECT kind,weekdays,to_char(starts_on,'YYYY-MM-DD') AS "startsOn" FROM jdatna.product_schedules
       WHERE product_id=$1 AND (kind<>'date' OR starts_on>=${TODAY}) ORDER BY starts_on`,
      [productId],
    )
  ).rows;
}

/* ───────── الأحداث والإرسال ───────── */
/** منتج جديد ظاهر: يُسجَّل حدثًا يُرسل بعد مهلة التجميع. لا يُفشل إضافة المنتج أبدًا. */
export async function queueNewProduct(productId: string) {
  try {
    await db().query(
      `INSERT INTO jdatna.family_alert_events(producer_id,product_id,kind)
       SELECT x.producer_id,x.id,'new' FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
       WHERE x.id=$1 AND x.visible AND x.deleted_at IS NULL AND p.status='approved' AND NOT p.review_only
         AND EXISTS(SELECT 1 FROM jdatna.family_follows f WHERE f.producer_id=p.id)`,
      [productId],
    );
    scheduleDispatch();
  } catch {
    // التنبيه تحسين؛ لا يوقف حفظ المنتج.
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** دورة إرسال بعد مهلة التجميع (في الخادم نفسه)، ودورة دورية احتياطية من instrumentation. */
export function scheduleDispatch() {
  if (timer || process.env.FAMILY_ALERTS_TIMER === "off") return;
  timer = setTimeout(
    () => {
      timer = null;
      void dispatchFamilyAlerts().catch(() => {});
    },
    (ALERT_GRACE_SECONDS + 5) * 1000,
  );
  timer.unref?.();
}

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );

type Pending = {
  userId: string;
  producerId: string;
  family: string;
  slug: string;
  token: string;
  kind: "new" | "schedule";
  items: {
    productId: string;
    product: string;
    ref: string;
    frequency: string;
  }[];
};

/**
 * يرسل التنبيهات المستحقة: يعلن الجداول التي بدأت، ثم يجمع الأحداث الأقدم من مهلة التجميع لكل عضو
 * وأسرة ونوع، فيرسل تنبيهًا واحدًا للدفعة. لا يكرر (family_alerts_sent)، ويحترم الحد اليومي.
 * قفل استشاري: نسخة واحدة من الخادم ترسل في الوقت نفسه.
 */
export async function dispatchFamilyAlerts(
  opts: { graceSeconds?: number; texts?: SiteTexts; dailyLimit?: number } = {},
) {
  if (!databaseConfigured()) return { sent: 0, suppressed: 0 };
  const grace = opts.graceSeconds ?? ALERT_GRACE_SECONDS;
  const limit = opts.dailyLimit ?? (await getAlertDailyLimit());
  const texts =
    opts.texts ?? (await (await import("./settings")).getSiteTexts());
  const outbox: AlertMessage[] = [];
  let suppressed = 0;
  await transaction(async (c) => {
    const locked = (
      await c.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext('jdatna.family_alerts')) AS ok",
      )
    ).rows[0].ok;
    if (!locked) return;
    // 1) الجداول التي بدأت اليوم أو قبله: حدث واحد لكل جدول.
    await c.query(
      `WITH due AS (
         UPDATE jdatna.product_schedules s SET announced_at=now()
         FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
         WHERE x.id=s.product_id AND s.announced_at IS NULL AND s.starts_on<=${TODAY}
           AND x.visible AND x.deleted_at IS NULL AND p.status='approved' AND NOT p.review_only
         RETURNING s.id,s.producer_id,s.product_id)
       INSERT INTO jdatna.family_alert_events(producer_id,product_id,kind,ref,created_at)
       SELECT producer_id,product_id,'schedule',id::text,now()-make_interval(secs=>$1) FROM due`,
      [grace + 1],
    );
    // 2) الأحداث المستحقة.
    const events = (
      await c.query<{
        producerId: string;
        productId: string;
        kind: "new" | "schedule";
        ref: string;
        product: string;
        family: string;
        slug: string;
        familyUser: string;
        sKind: string | null;
        sDate: string | null;
      }>(
        `WITH ev AS (
           UPDATE jdatna.family_alert_events e SET processed_at=now()
           WHERE e.processed_at IS NULL AND e.created_at<=now()-make_interval(secs=>$1)
           RETURNING e.producer_id,e.product_id,e.kind,e.ref,e.id)
         SELECT ev.producer_id AS "producerId",ev.product_id AS "productId",ev.kind,ev.ref,x.name AS product,
           COALESCE(p.trade_name,p.name) AS family,p.slug,p.user_id AS "familyUser",
           s.kind AS "sKind",to_char(s.starts_on,'YYYY-MM-DD') AS "sDate"
         FROM ev JOIN jdatna.products x ON x.id=ev.product_id JOIN jdatna.producer_profiles p ON p.id=ev.producer_id
         LEFT JOIN jdatna.product_schedules s ON ev.kind='schedule' AND s.id::text=ev.ref
         WHERE x.visible AND x.deleted_at IS NULL ORDER BY ev.id`,
        [grace],
      )
    ).rows;
    if (!events.length) return;
    // 3) المستلمون: متابعون غير متوقفين، يريدون هذا النوع، والمنتج ضمن نطاقهم.
    const groups = new Map<string, Pending>();
    for (const e of events) {
      const recipients = (
        await c.query<{ userId: string; token: string }>(
          `SELECT f.user_id AS "userId",f.unsubscribe_token AS token FROM jdatna.family_follows f
           WHERE f.producer_id=$1 AND NOT f.paused AND f.user_id<>$2
             AND (CASE WHEN $3='new' THEN f.notify_new ELSE f.notify_schedule END)
             AND (f.scope='all' OR EXISTS(SELECT 1 FROM jdatna.family_follow_products fp
                  WHERE fp.user_id=f.user_id AND fp.producer_id=f.producer_id AND fp.product_id=$4))`,
          [e.producerId, e.familyUser, e.kind, e.productId],
        )
      ).rows;
      const frequency =
        e.sKind === "daily"
          ? texts["alerts.daily"]
          : e.sKind === "weekly"
            ? texts["alerts.weekly"]
            : e.sKind === "date"
              ? fill(texts["alerts.onDate"], { date: e.sDate ?? "" })
              : "";
      for (const r of recipients) {
        // لا تكرار: المنتج والحدث نفسه لا يصل العضو مرتين.
        const fresh = (
          await c.query(
            `INSERT INTO jdatna.family_alerts_sent(user_id,product_id,kind,ref) VALUES($1,$2,$3,$4)
             ON CONFLICT DO NOTHING RETURNING 1`,
            [r.userId, e.productId, e.kind, e.ref],
          )
        ).rowCount;
        if (!fresh) continue;
        const key = `${r.userId}|${e.producerId}|${e.kind}`;
        const g = groups.get(key) ?? {
          userId: r.userId,
          producerId: e.producerId,
          family: e.family,
          slug: e.slug,
          token: r.token,
          kind: e.kind,
          items: [],
        };
        g.items.push({
          productId: e.productId,
          product: e.product,
          ref: e.ref,
          frequency,
        });
        groups.set(key, g);
      }
    }
    // 4) الحد اليومي، ثم الرسائل (تنبيه واحد لكل مجموعة).
    const usedToday = new Map<string, number>();
    for (const g of groups.values()) {
      if (!usedToday.has(g.userId))
        usedToday.set(
          g.userId,
          (
            await c.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM jdatna.member_alerts WHERE user_id=$1
               AND (created_at AT TIME ZONE 'Asia/Riyadh')::date=${TODAY}`,
              [g.userId],
            )
          ).rows[0].n,
        );
      const used = usedToday.get(g.userId)!;
      if (used >= limit) {
        suppressed++;
        await c.query(
          "UPDATE jdatna.family_alerts_sent SET suppressed=true WHERE user_id=$1 AND product_id=ANY($2::uuid[]) AND kind=$3",
          [g.userId, g.items.map((i) => i.productId), g.kind],
        );
        continue;
      }
      usedToday.set(g.userId, used + 1);
      outbox.push(message(g, texts));
    }
    // صندوق «تنبيهاتي» داخل المعاملة نفسها (يُحسب منه الحد اليومي).
    for (const m of outbox)
      await c.query(
        "INSERT INTO jdatna.member_alerts(id,user_id,producer_id,title,body,url) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), m.userId, m.producerId, m.title, m.body, m.url],
      );
  });
  // القنوات الخارجية بعد حفظ المعاملة؛ فشل قناة لا يمنع غيرها، ويبقى التنبيه في «تنبيهاتي».
  for (const m of outbox)
    for (const ch of channelOverride ?? ALERT_CHANNELS)
      try {
        if (await ch.enabled()) await ch.send(m);
      } catch {
        // قناة متعثرة.
      }
  return { sent: outbox.length, suppressed, messages: outbox };
}

function message(g: Pending, texts: SiteTexts): AlertMessage {
  const unsubscribe = `${SITE_URL}/alerts/unsubscribe?t=${g.token}`;
  const one = g.items.length === 1 ? g.items[0] : null;
  const url = one
    ? `${SITE_URL}/products/${one.productId}`
    : `${SITE_URL}/producers/${g.slug}`;
  const main =
    g.kind === "new"
      ? one
        ? fill(texts["alerts.msgNew"], {
            product: one.product,
            family: g.family,
            link: url,
          })
        : fill(texts["alerts.msgNewBatch"], {
            count: g.items.length,
            family: g.family,
            link: url,
          })
      : g.items
          .map((i) =>
            fill(texts["alerts.msgSchedule"], {
              product: i.product,
              frequency: i.frequency,
              family: g.family,
              link: one ? url : `${SITE_URL}/products/${i.productId}`,
            }),
          )
          .join("\n");
  const body = [
    main,
    fill(texts["alerts.unsubscribeLine"], { link: unsubscribe }),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    userId: g.userId,
    producerId: g.producerId,
    title: fill(texts["alerts.title"], { family: g.family }),
    body,
    url,
    tag: `family-${g.producerId}-${g.kind}`,
  };
}
