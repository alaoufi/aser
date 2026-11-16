import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { db, databaseConfigured } from "./db";
import { HttpError } from "./security";
import type { SessionUser } from "../lib/types";

export type SecurityEventKind =
  | "login.failed"
  | "login.admin"
  | "otp.failed"
  | "rate_limited"
  | "access.denied"
  | "origin.rejected";

/** تمويه ثابت (HMAC) لا يُعكس: يجمّع محاولات المصدر الواحد دون حفظ العنوان أو الجوال نصًّا. */
export function mask(value: string) {
  const pepper = process.env.OTP_HASH_SECRET || "jdatna-development-only";
  return createHmac("sha256", pepper)
    .update(`security:${value}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * عنوان الزائر الحقيقي: Caddy (البوابة الوحيدة إلى الموقع) يضع عنوان من اتصل به آخر قيمة
 * في X-Forwarded-For ويتجاهل ما أرسله الزائر. التطبيق لا يُصل إليه إلا عبره (منفذ داخلي 8092).
 */
export function clientIp(request: Request): string | null {
  const last = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .at(-1);
  return last && isIP(last) ? last : null;
}

/** مفتاح حدود المحاولات لعنوان الزائر، أو null إن لم يُعرف العنوان. */
export function sourceKey(request: Request) {
  const ip = clientIp(request);
  return ip ? mask(`ip:${ip}`) : null;
}

/** يسجّل حدثًا أمنيًا دون أن يُفشل الطلب الأصلي أبدًا. */
export async function recordSecurityEvent(
  kind: SecurityEventKind,
  details: {
    request?: Request;
    userId?: string | null;
    subject?: string | null;
    detail?: string;
  } = {},
) {
  if (!databaseConfigured()) return;
  try {
    const source = details.request ? sourceKey(details.request) : null;
    await db().query(
      "INSERT INTO jdatna.security_events(id,kind,user_id,source,subject,detail) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        kind,
        details.userId ?? null,
        source,
        details.subject ? mask(`subject:${details.subject}`) : null,
        details.detail?.slice(0, 200) ?? null,
      ],
    );
    if (kind === "login.failed" || kind === "otp.failed")
      await alertOnBurst(kind);
  } catch {
    // السجل لا يمنع الخدمة.
  }
}

/** هجوم واسع (50 محاولة فاشلة خلال 10 دقائق): إشعار لمديري المنصة، مرة في الساعة على الأكثر. */
async function alertOnBurst(kind: SecurityEventKind) {
  const recent = (
    await db().query(
      "SELECT count(*)::int AS n FROM jdatna.security_events WHERE kind=$1 AND created_at>now()-interval '10 minutes'",
      [kind],
    )
  ).rows[0].n as number;
  if (recent < 50) return;
  const claimed = (
    await db().query(
      `INSERT INTO jdatna.rate_limits(key,count,reset_at) VALUES('security-alert',1,now()+interval '1 hour')
       ON CONFLICT(key) DO UPDATE SET count=1,reset_at=now()+interval '1 hour' WHERE rate_limits.reset_at<=now()
       RETURNING key`,
    )
  ).rowCount;
  if (!claimed) return;
  const admins = (
    await db().query(
      "SELECT id FROM jdatna.users WHERE role='admin' AND suspended_at IS NULL AND deleted_at IS NULL",
    )
  ).rows as { id: string }[];
  const { notifyUser } = await import("./push");
  await Promise.all(
    admins.map((a) =>
      notifyUser(a.id, {
        title: "تنبيه أمني: محاولات دخول فاشلة كثيرة",
        body: `${recent} محاولة فاشلة خلال 10 دقائق. راجع «سجل الأمان» في الإدارة.`,
        url: "/admin?tab=security",
        tag: "security-alert",
      }),
    ),
  );
}

/** «سجل الأمان» في الإدارة: لمدير المنصة فقط. */
export async function securityOverview(user: SessionUser) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
  const [summary, suspicious, events] = await Promise.all([
    db().query(
      `SELECT kind,count(*)::int AS count FROM jdatna.security_events
       WHERE created_at>now()-interval '24 hours' GROUP BY kind ORDER BY count DESC`,
    ),
    // مصادر مشبوهة: 5 محاولات فاشلة أو أكثر خلال ساعة، من عنوان واحد أو على حساب واحد.
    db().query(
      `SELECT 'source' AS by, source AS key, count(*)::int AS count, max(created_at) AS "lastAt"
         FROM jdatna.security_events
        WHERE kind IN ('login.failed','otp.failed') AND source IS NOT NULL AND created_at>now()-interval '1 hour'
        GROUP BY source HAVING count(*)>=5
       UNION ALL
       SELECT 'account', subject, count(*)::int, max(created_at)
         FROM jdatna.security_events
        WHERE kind='login.failed' AND subject IS NOT NULL AND created_at>now()-interval '1 hour'
        GROUP BY subject HAVING count(*)>=5
       ORDER BY count DESC LIMIT 20`,
    ),
    db().query(
      `SELECT e.id,e.kind,e.source,e.subject,e.detail,e.created_at AS "createdAt",u.name AS "userName"
         FROM jdatna.security_events e LEFT JOIN jdatna.users u ON u.id=e.user_id
        ORDER BY e.created_at DESC LIMIT 100`,
    ),
  ]);
  return {
    summary: summary.rows as { kind: SecurityEventKind; count: number }[],
    suspicious: suspicious.rows as {
      by: "source" | "account";
      key: string;
      count: number;
      lastAt: string;
    }[],
    events: events.rows as {
      id: string;
      kind: SecurityEventKind;
      source: string | null;
      subject: string | null;
      detail: string | null;
      createdAt: string;
      userName: string | null;
    }[],
  };
}
