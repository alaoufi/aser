import { createHmac, randomUUID } from "node:crypto";
import { can } from "../lib/permissions";
import { isIP } from "node:net";
import { db, databaseConfigured } from "./db";
import { HttpError } from "./security";
import { z } from "zod";
import type { SessionUser } from "../lib/types";

export type SecurityEventKind =
  | "login.failed"
  | "login.admin"
  | "otp.failed"
  | "rate_limited"
  | "access.denied"
  | "origin.rejected"
  | "login.locked"
  | "login.while_locked";

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
    const ip = details.request ? clientIp(details.request) : null;
    await db().query(
      "INSERT INTO jdatna.security_events(id,kind,user_id,source,subject,detail,ip) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        kind,
        details.userId ?? null,
        source,
        details.subject ? mask(`subject:${details.subject}`) : null,
        details.detail?.slice(0, 200) ?? null,
        ip,
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
        body: `${recent} محاولة فاشلة خلال 10 دقائق. راجع «التقرير الأمني» في الإدارة.`,
        url: "/admin?tab=security",
        tag: "security-alert",
      }),
    ),
  );
}

/**
 * اسم الدخول المُجرَّب كما يظهر في التقرير: مخفيّ أغلبه (جوال 05••••••23، اسم ab•••)،
 * يكفي لمعرفة المستهدف دون كشف بيانات صاحبه.
 */
export function identifierHint(value: string) {
  const v = value.trim();
  if (!v) return "";
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length === v.replace(/[\s+()-]/g, "").length)
    return `${digits.slice(0, 2)}••••••${digits.slice(-2)}`;
  return `${[...v].slice(0, 2).join("")}•••`;
}

/** حالة الحدث في التقرير: فشل (دخول أو رمز خاطئ)، محظور (حد أو رفض)، نجح (دخول إدارة). */
export const eventStatus: Record<
  SecurityEventKind,
  "failed" | "blocked" | "success"
> = {
  "login.failed": "failed",
  "otp.failed": "failed",
  rate_limited: "blocked",
  "access.denied": "blocked",
  "origin.rejected": "blocked",
  "login.locked": "blocked",
  "login.while_locked": "blocked",
  "login.admin": "success",
};
const statusKinds = {
  failed: ["login.failed", "otp.failed"],
  blocked: [
    "rate_limited",
    "access.denied",
    "origin.rejected",
    "login.locked",
    "login.while_locked",
  ],
  success: ["login.admin"],
} as const;

const reportSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: z.enum(["all", "failed", "blocked", "success"]).default("all"),
  })
  .strict();

/**
 * «التقرير الأمني» للمدير: محاولات اختراق الموقع في فترة (اليوم، 7، 30، 90 يومًا، أو من–إلى)
 * ببطاقات ملخص ورسم يومي وأكثر الدول والعناوين هجومًا وجدول الأحداث. الأيام بتوقيت الرياض.
 */
export async function securityReport(user: SessionUser, input: unknown) {
  if (!can(user, "security")) throw new HttpError(403, "لا تملك صلاحية الوصول");
  const v = reportSchema.parse(input);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
  const to = v.to ?? today;
  const from =
    v.from ??
    new Date(Date.parse(to) - 6 * 86400_000).toISOString().slice(0, 10);
  if (from > to) throw new HttpError(400, "بداية الفترة بعد نهايتها");
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1;
  if (days > 90) throw new HttpError(400, "أقصى فترة 90 يومًا (مدة حفظ السجل)");
  const kinds: string[] =
    v.status === "all" ? Object.keys(eventStatus) : [...statusKinds[v.status]];
  const base = `FROM jdatna.security_events e
    WHERE (e.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $1::date AND $2::date
      AND e.kind = ANY($3::text[])`;
  const args = [from, to, kinds];
  const attack = `e.kind IN ('login.failed','otp.failed','rate_limited','access.denied','origin.rejected','login.locked','login.while_locked')`;
  const [counts, distinct, daily, ips, events] = await Promise.all([
    db().query(
      `SELECT e.kind,count(*)::int AS n ${base} GROUP BY e.kind`,
      args,
    ),
    db().query(
      `SELECT count(DISTINCT COALESCE(host(e.ip),e.source))::int AS n ${base} AND ${attack}`,
      args,
    ),
    db().query(
      `SELECT to_char((e.created_at AT TIME ZONE 'Asia/Riyadh')::date,'YYYY-MM-DD') AS day,
         count(*) FILTER (WHERE e.kind IN ('login.failed','otp.failed'))::int AS failed,
         count(*) FILTER (WHERE e.kind IN ('rate_limited','access.denied','origin.rejected','login.locked','login.while_locked'))::int AS blocked
       ${base} GROUP BY 1 ORDER BY 1`,
      args,
    ),
    db().query(
      `SELECT host(e.ip) AS ip,count(*)::int AS n ${base} AND e.ip IS NOT NULL AND ${attack}
       GROUP BY e.ip ORDER BY n DESC`,
      args,
    ),
    // صف لكل عنوان وحدث وساعة مع العدد، كما في تقارير الخادم.
    db().query(
      `SELECT max(e.created_at) AS at,e.kind,host(e.ip) AS ip,e.source,count(*)::int AS attempts,
         max(e.detail) AS detail,max(u.name) AS "userName"
       ${base.replace("FROM jdatna.security_events e", "FROM jdatna.security_events e LEFT JOIN jdatna.users u ON u.id=e.user_id")}
       GROUP BY e.kind,e.ip,e.source,date_trunc('hour',e.created_at),e.detail
       ORDER BY at DESC LIMIT 200`,
      args,
    ),
  ]);
  const byKind = new Map<string, number>(
    counts.rows.map((r) => [r.kind as string, r.n as number]),
  );
  const n = (k: string) => byKind.get(k) ?? 0;
  const ipRows = ips.rows as { ip: string; n: number }[];
  const eventRows = events.rows as {
    at: string;
    kind: SecurityEventKind;
    ip: string | null;
    source: string | null;
    attempts: number;
    detail: string | null;
    userName: string | null;
  }[];
  const { countriesOf } = await import("./geoip");
  const geo = await countriesOf([
    ...new Set([
      ...ipRows.map((r) => r.ip),
      ...eventRows.flatMap((r) => (r.ip ? [r.ip] : [])),
    ]),
  ]);
  const countryTotals = new Map<string, number>();
  for (const r of ipRows) {
    const code = geo.get(r.ip);
    if (code) countryTotals.set(code, (countryTotals.get(code) ?? 0) + r.n);
  }
  const attempts =
    n("login.failed") +
    n("otp.failed") +
    n("rate_limited") +
    n("access.denied") +
    n("origin.rejected") +
    n("login.while_locked");
  const dayMap = new Map(
    (daily.rows as { day: string; failed: number; blocked: number }[]).map(
      (d) => [d.day, d],
    ),
  );
  return {
    range: { from, to, days },
    geoAvailable: [...geo.values()].some(Boolean) || geo.size === 0,
    cards: {
      attempts,
      sources: distinct.rows[0].n as number,
      countries: countryTotals.size,
      perDay: Math.round(attempts / days),
      loginFailed: n("login.failed"),
      otpFailed: n("otp.failed"),
      rateLimited: n("rate_limited"),
      denied: n("access.denied") + n("origin.rejected"),
      locked: n("login.locked"),
      adminLogins: n("login.admin"),
    },
    daily: Array.from({ length: days }, (_, i) => {
      const day = new Date(Date.parse(from) + i * 86400_000)
        .toISOString()
        .slice(0, 10);
      return {
        day,
        failed: dayMap.get(day)?.failed ?? 0,
        blocked: dayMap.get(day)?.blocked ?? 0,
      };
    }),
    topCountries: [...countryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([code, count]) => ({ code, count })),
    topIps: ipRows
      .slice(0, 10)
      .map((r) => ({ ip: r.ip, count: r.n, code: geo.get(r.ip) ?? null })),
    events: eventRows.map((r) => ({
      at: r.at,
      kind: r.kind,
      status: eventStatus[r.kind],
      ip: r.ip ?? (r.source ? `مموّه ${r.source.slice(0, 6)}` : null),
      code: r.ip ? (geo.get(r.ip) ?? null) : null,
      attempts: r.attempts,
      detail: [r.userName, r.detail].filter(Boolean).join(" · ") || null,
    })),
  };
}
