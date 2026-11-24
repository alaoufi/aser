import { createOtp } from "./otp";
import { z } from "zod";
import { sendSms, smsTransportConfigured } from "./sms";
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { SessionUser } from "../lib/types";
import { db, transaction, databaseConfigured } from "./db";
import { HttpError, normalizePhone, sameSite } from "./security";
export const cookieName = "jdatna_session";
/** ملف دخول «لوحة الإدارة»: مستقل عن الجلسة الشخصية (مثل «أي خدمة»، قرار المالك 2026-11-21). */
export const adminCookieName = "jdatna_admin";
/** جلسة الإدارة 12 ساعة ولا تتجدد (الحماية أولًا، قرار المالك 2026-11-17). */
export const ADMIN_AREA_SECONDS = 12 * 60 * 60;
export const otpPurposeSchema = z.enum(["signup", "reset"]);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function storageConfigured() {
  return Boolean(
    process.env.S3_BUCKET &&
    process.env.S3_REGION &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    /^[a-f0-9]{64}$/i.test(process.env.DOCUMENT_ENCRYPTION_KEY ?? ""),
  );
}
export function smsConfigured() {
  return (
    smsTransportConfigured() &&
    (process.env.OTP_HASH_SECRET?.length ?? 0) >= 32 &&
    process.env.SMS_VERIFIED === "true"
  );
}
export function registrationOpen() {
  return (
    databaseConfigured() &&
    storageConfigured() &&
    smsConfigured() &&
    process.env.PRIVATE_STORAGE_VERIFIED === "true"
  );
}
export async function sessionUser(
  request: Request,
): Promise<SessionUser | null> {
  return (await sessionInfo(request))?.user ?? null;
}
function cookieToken(request: Request, name: string) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
/** رمز الجلسة الشخصية (الموقع). */
export function sessionToken(request: Request) {
  return cookieToken(request, cookieName);
}
/** رمز جلسة لوحة الإدارة. */
export function adminToken(request: Request) {
  return cookieToken(request, adminCookieName);
}
const underAdmin = (path: string) =>
  path === "/admin" || path.startsWith("/admin/");
/**
 * هل الطلب من «لوحة الإدارة»؟ مسارات /api/admin كلها، أو طلب صادر من صفحة تحت /admin في الموقع نفسه
 * (صور المنتجات والمستندات والعقود التي تعرضها اللوحة). المتصفح يكتب Referer ولا يستطيع موقع آخر
 * أن يجعله صفحة من صفحاتنا، فطلب الموقع العادي لا يصل لصلاحيات الإدارة أبدًا، وطلب اللوحة لا يستعمل
 * الجلسة الشخصية.
 */
export function adminArea(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/"))
    return true;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const from = new URL(referer);
    return sameSite(from.origin, request) && underAdmin(from.pathname);
  } catch {
    return false;
  }
}
/**
 * الحساب الشخصي لمن له صلاحيات إدارية: عضو كغيره (عميل، أو أسرة إن كان له ملف أسرة)،
 * بلا أي صلاحية إدارية. يبقى «adminAccess» ليظهر له رابط «لوحة الإدارة» فقط.
 */
export function personal(user: SessionUser): SessionUser {
  const manager = user.role === "admin" || Boolean(user.permissions?.length);
  if (!manager) return user;
  return {
    ...user,
    role:
      user.role === "admin"
        ? user.familyName
          ? "producer"
          : "customer"
        : user.role,
    permissions: [],
    adminAccess: true,
  };
}
export async function sessionInfo(request: Request): Promise<{
  user: SessionUser;
  hasPassword: boolean;
  canSetCredentials: boolean;
} | null> {
  if (!databaseConfigured()) return null;
  // لوحة الإدارة بجلستها هي فقط، والموقع بالجلسة الشخصية فقط.
  const admin = adminArea(request);
  const token = admin ? adminToken(request) : sessionToken(request);
  if (!token) return null;
  const row = (
    await db().query(
      `SELECT u.id,u.name,u.phone,u.role,u.username,u.member_no AS "memberNo",u.permissions,(u.password_hash IS NOT NULL) AS "hasPassword",false AS "canSetCredentials",
        (SELECT COALESCE(p.trade_name,p.name) FROM jdatna.producer_profiles p WHERE p.user_id=u.id) AS "familyName",
        EXISTS (SELECT 1 FROM jdatna.producer_profiles p WHERE p.user_id=u.id AND p.status='approved') AS "familyApproved"
       FROM jdatna.sessions s JOIN jdatna.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.setup_only AND u.suspended_at IS NULL
         AND s.scope=$2 AND ($2='site' OR u.role='admin' OR cardinality(u.permissions)>0)`,
      [hash(token), admin ? "admin" : "site"],
    )
  ).rows[0];
  if (!row) return null;
  const { hasPassword, canSetCredentials, ...user } = row;
  return {
    user: admin ? user : personal(user),
    hasPassword,
    canSetCredentials,
  };
}
export async function requireUser(request: Request, roles?: string[]) {
  const user = await sessionUser(request);
  if (!user) throw new HttpError(401, "يرجى تسجيل الدخول");
  if (roles && !roles.includes(user.role))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  return user;
}
export async function rateLimit(key: string, max: number, seconds: number) {
  const result = await db().query(
    `INSERT INTO jdatna.rate_limits(key,count,reset_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.count+1 END,reset_at=CASE WHEN rate_limits.reset_at<=now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING count`,
    [key, seconds],
  );
  const count = result.rows[0].count as number;
  if (count > max) {
    // أول تجاوز في النافذة فقط يُسجَّل، فلا يُغرق السجل بالتكرار.
    if (count === max + 1) {
      const { recordSecurityEvent } = await import("./security-events");
      await recordSecurityEvent("rate_limited", {
        detail: key.split(":")[0],
      });
    }
    throw new HttpError(429, "محاولات كثيرة، يرجى المحاولة لاحقًا");
  }
}
const otpHash = (id: string, code: string) =>
  createHmac("sha256", process.env.OTP_HASH_SECRET!)
    .update(id + ":" + code)
    .digest("hex");
export function otpMessage(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid OTP format");
  return `رمز التحقق للتسجيل في موقع أكلات جدتنا ${code}`;
}
export async function requestOtp(phoneValue: string, purpose: OtpPurpose) {
  otpPurposeSchema.parse(purpose);
  if (!registrationOpen())
    throw new HttpError(
      503,
      "التسجيل غير متاح حتى اعتماد خدمات التحقق وحفظ المستندات",
    );
  const phone = normalizePhone(phoneValue);
  await rateLimit("otp-global", 600, 3600);
  await rateLimit("otp-phone:" + hash(phone), 3, 900);
  // سقف يومي لكل جوال: حتى مع رمز من ستة أرقام لا تُتاح محاولات تخمين متواصلة طوال اليوم.
  await rateLimit("otp-phone-day:" + hash(phone), 8, 86400);
  // أرقام مراجعة المتاجر: لا رسالة، والرمز الثابت أثناء «وضع المراجعة» فقط
  // (قبل فحص «الجوال مسجل» لأنها تحرر رقم إنشاء الحساب من حساب مراجعة سابق).
  const { reviewOtpCode } = await import("./store-review");
  const fixed = await reviewOtpCode(phone, purpose);
  const existing = (
    await db().query(
      `SELECT id,(password_hash IS NOT NULL OR role<>'customer' OR cardinality(permissions)>0) AS "hasPassword" FROM jdatna.users WHERE phone=$1`,
      [phone],
    )
  ).rows[0] as { id: string; hasPassword: boolean } | undefined;
  const exists = Boolean(existing);
  // تسجيل لم يكتمل (عميل تحقق من الجوال ثم خرج قبل كلمة المرور): يُكمل التسجيل، لا «الجوال مسجل».
  // حسابات الإدارة والمشرفين بلا كلمة مرور تُكمَل بـ«نسيت كلمة المرور» فقط.
  if (purpose === "signup" && existing?.hasPassword)
    throw new HttpError(
      409,
      "الجوال مسجل؛ ادخل بكلمة المرور أو استخدم نسيت كلمة المرور",
    );
  if (purpose === "reset" && !exists)
    throw new HttpError(400, "لا يوجد حساب لهذا الجوال؛ أنشئ حسابًا جديدًا");
  const id = randomUUID(),
    code = fixed ?? createOtp();
  await db().query(
    "INSERT INTO jdatna.otp_challenges(id,phone,code_hash,expires_at,purpose) VALUES($1,$2,$3,now()+interval '5 minutes',$4)",
    [id, phone, otpHash(id, code), purpose],
  );
  if (fixed) return { challengeId: id };
  try {
    await sendSms(phone, otpMessage(code));
  } catch {
    await db().query("DELETE FROM jdatna.otp_challenges WHERE id=$1", [id]);
    throw new HttpError(503, "تعذر إرسال رمز التحقق");
  }
  return { challengeId: id };
}
export async function verifyOtp(
  id: string,
  code: string,
  name?: string,
  purpose?: OtpPurpose,
  /** «ادعُ صديقًا»: رمز رابط الدعوة المحفوظ في الجهاز، أو رقم من دعاه. */
  referral?: { invite?: string | null; link?: string | null },
) {
  if (!registrationOpen()) throw new HttpError(503, "خدمة التحقق غير متاحة");
  await rateLimit("verify-global", 8000, 3600);
  await rateLimit("verify:" + id, 8, 900);
  /* failed attempts must commit, not roll back */ return transaction(
    async (client) => {
      const challenge = (
        await client.query(
          "SELECT * FROM jdatna.otp_challenges WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !challenge ||
        challenge.consumed_at ||
        new Date(challenge.expires_at).getTime() < Date.now() ||
        challenge.attempts >= 5 ||
        !otpPurposeSchema.safeParse(challenge.purpose).success ||
        (purpose !== undefined && challenge.purpose !== purpose)
      )
        return null;
      await client.query(
        "UPDATE jdatna.otp_challenges SET attempts=attempts+1 WHERE id=$1",
        [id],
      );
      // سقف يومي للمحاولات على الجوال الواحد عبر كل رموزه: 10 محاولات من 9000 احتمال يوميًا.
      await rateLimit("verify-phone-day:" + hash(challenge.phone), 10, 86400);
      if (
        !timingSafeEqual(
          Buffer.from(challenge.code_hash, "hex"),
          Buffer.from(otpHash(id, code), "hex"),
        )
      )
        return null;
      await client.query(
        "UPDATE jdatna.otp_challenges SET consumed_at=now() WHERE id=$1",
        [id],
      );
      // Serialize competing challenges for this phone; signup never upgrades into reset/login.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,2))",
        [challenge.phone],
      );
      let user: SessionUser | undefined;
      if (challenge.purpose === "signup") {
        user = (
          await client.query(
            // تسجيل جديد، أو إكمال تسجيل سابق لم تُعيَّن له كلمة مرور (ولا يمس حسابًا مكتملًا).
            `INSERT INTO jdatna.users(id,phone,name,phone_verified_at,review_account) VALUES($1,$2,$3,now(),$4)
             ON CONFLICT(phone) DO UPDATE SET phone_verified_at=now()
             WHERE jdatna.users.password_hash IS NULL AND jdatna.users.deleted_at IS NULL
               AND jdatna.users.role='customer' AND cardinality(jdatna.users.permissions)=0
             RETURNING id,name,phone,role,username`,
            [
              randomUUID(),
              challenge.phone,
              name?.trim() || "مستخدم",
              (await import("./store-review")).isReviewPhone(challenge.phone),
            ],
          )
        ).rows[0];
      } else {
        user = (
          await client.query(
            "UPDATE jdatna.users SET phone_verified_at=now() WHERE phone=$1 RETURNING id,name,phone,role,username",
            [challenge.phone],
          )
        ).rows[0];
      }
      if (!user) return null;
      // حساب جديد أكّد جواله: يُحسب لمن دعاه (مرة واحدة، ولا يُفشل التسجيل أبدًا).
      if (
        challenge.purpose === "signup" &&
        (referral?.invite || referral?.link)
      ) {
        const { recordReferral } = await import("./referrals");
        await client.query("SAVEPOINT referral");
        try {
          await recordReferral(client, user.id, referral);
          await client.query("RELEASE SAVEPOINT referral");
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT referral");
        }
      }
      const token = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,setup_until,setup_only) VALUES($1,$2,now()+interval '10 minutes',now()+interval '10 minutes',true)",
        [hash(token), user.id],
      );
      return { user, token };
    },
  );
}
// رمز الجوال عند التسجيل أول مرة ونسيان كلمة المرور فقط (بطلب المالك).
// الخطوة الثانية لدخول الإدارة اختيارية: ADMIN_LOGIN_OTP=on يعيدها (يتطلب وصولًا للخادم).
export function adminOtpRequired() {
  return process.env.ADMIN_LOGIN_OTP === "on" && smsConfigured();
}
/** الدخول يبقى سنة كاملة، ويتجدد مع كل زيارة فلا يُطلب مرة أخرى. */
export const SESSION_SECONDS = 60 * 60 * 24 * 365;
/**
 * انتهاء الجلسة الشخصية الجديدة: سنة تتجدد مع كل زيارة، للجميع. صاحب الصلاحيات الإدارية مثل غيره هنا،
 * لأن الإدارة صارت بجلسة مستقلة 12 ساعة (createAdminSession، قرار المالك 2026-11-21).
 */
export const SESSION_EXPIRY = `now()+interval '365 days'`;
/** يمدد الجلسة النشطة سنة من آخر زيارة (مرة كل يوم على الأكثر). */
export async function renewSession(request: Request) {
  const token = sessionToken(request);
  if (!token || !databaseConfigured()) return false;
  const r = await db().query(
    `UPDATE jdatna.sessions s SET expires_at=now()+interval '365 days' WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.setup_only AND s.scope='site' AND s.expires_at<now()+interval '364 days'`,
    [hash(token)],
  );
  return (r.rowCount ?? 0) > 0;
}
export async function startAdminChallenge(
  client: { query: (sql: string, args: unknown[]) => Promise<unknown> },
  phone: string,
) {
  const id = randomUUID(),
    code = createOtp();
  await client.query(
    "INSERT INTO jdatna.otp_challenges(id,phone,code_hash,expires_at,purpose) VALUES($1,$2,$3,now()+interval '5 minutes','admin')",
    [id, phone, otpHash(id, code)],
  );
  try {
    await sendSms(phone, `رمز دخول إدارة أكلات جدتنا ${code}`);
  } catch {
    throw new HttpError(503, "تعذر إرسال رمز دخول الإدارة");
  }
  return id;
}
export async function verifyAdminLogin(id: string, code: string) {
  await rateLimit("verify-global", 8000, 3600);
  await rateLimit("verify:" + id, 8, 900);
  /* failed attempts must commit, not roll back */ return transaction(
    async (client) => {
      const challenge = (
        await client.query(
          "SELECT * FROM jdatna.otp_challenges WHERE id=$1 AND purpose='admin' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !challenge ||
        challenge.consumed_at ||
        new Date(challenge.expires_at).getTime() < Date.now() ||
        challenge.attempts >= 5
      )
        return null;
      await client.query(
        "UPDATE jdatna.otp_challenges SET attempts=attempts+1 WHERE id=$1",
        [id],
      );
      if (
        !timingSafeEqual(
          Buffer.from(challenge.code_hash, "hex"),
          Buffer.from(otpHash(id, code), "hex"),
        )
      )
        return null;
      await client.query(
        "UPDATE jdatna.otp_challenges SET consumed_at=now() WHERE id=$1",
        [id],
      );
      const user = (
        await client.query(
          "SELECT id,name,phone,role,username,permissions FROM jdatna.users WHERE phone=$1 AND (role='admin' OR cardinality(permissions)>0) AND suspended_at IS NULL AND phone_verified_at IS NOT NULL",
          [challenge.phone],
        )
      ).rows[0] as SessionUser | undefined;
      if (!user) return null;
      const token = randomBytes(32).toString("hex");
      await client.query(
        `INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,${SESSION_EXPIRY})`,
        [hash(token), user.id],
      );
      return { user, token };
    },
  );
}
export const ADMIN_SESSION_SECONDS = SESSION_SECONDS;
const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");
export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure()}`;
}
/** ملف دخول اللوحة: SameSite=Strict، فلا يُرسل مع طلب يبدأ من موقع آخر. */
export function adminCookie(token: string, maxAge = ADMIN_AREA_SECONDS) {
  return `${adminCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure()}`;
}
/**
 * «لوحة الإدارة» من الحساب الشخصي بضغطة (مثل «أي خدمة»): جلسة إدارة مستقلة 12 ساعة لا تتجدد،
 * لصاحب صلاحيات إدارية فقط. لا تغيّر الجلسة الشخصية.
 */
export async function createAdminSession(request: Request) {
  const token = sessionToken(request);
  if (!token || !databaseConfigured())
    throw new HttpError(401, "يرجى تسجيل الدخول");
  const owner = (
    await db().query(
      `SELECT u.id FROM jdatna.sessions s JOIN jdatna.users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.setup_only AND s.scope='site'
         AND u.suspended_at IS NULL AND (u.role='admin' OR cardinality(u.permissions)>0)`,
      [hash(token)],
    )
  ).rows[0] as { id: string } | undefined;
  if (!owner) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const admin = randomBytes(32).toString("hex");
  await db().query(
    `INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,scope) VALUES($1,$2,now()+interval '12 hours','admin')`,
    [hash(admin), owner.id],
  );
  return { token: admin, userId: owner.id };
}
/**
 * الخروج: من اللوحة يُغلق جلسة الإدارة وحدها ويبقى الحساب الشخصي.
 * ومن الموقع يُغلق الجلسة الشخصية وجلسة الإدارة في هذا الجهاز معًا.
 */
export async function logout(request: Request) {
  if (!databaseConfigured()) return;
  const tokens = adminArea(request)
    ? [adminToken(request)]
    : [sessionToken(request), adminToken(request)];
  for (const token of tokens)
    if (token)
      await db().query("DELETE FROM jdatna.sessions WHERE token_hash=$1", [
        hash(token),
      ]);
}
