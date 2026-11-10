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
import { HttpError, normalizePhone } from "./security";
export const cookieName = "jdatna_session";
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
export function sessionToken(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function sessionInfo(request: Request): Promise<{
  user: SessionUser;
  hasPassword: boolean;
  canSetCredentials: boolean;
} | null> {
  if (!databaseConfigured()) return null;
  const token = sessionToken(request);
  if (!token) return null;
  const row = (
    await db().query(
      'SELECT u.id,u.name,u.phone,u.role,u.username,u.permissions,(u.password_hash IS NOT NULL) AS "hasPassword",false AS "canSetCredentials" FROM jdatna.sessions s JOIN jdatna.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.setup_only AND u.suspended_at IS NULL',
      [hash(token)],
    )
  ).rows[0];
  if (!row) return null;
  const { hasPassword, canSetCredentials, ...user } = row;
  return { user, hasPassword, canSetCredentials };
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
  if (result.rows[0].count > max)
    throw new HttpError(429, "محاولات كثيرة، يرجى المحاولة لاحقًا");
}
const otpHash = (id: string, code: string) =>
  createHmac("sha256", process.env.OTP_HASH_SECRET!)
    .update(id + ":" + code)
    .digest("hex");
export function otpMessage(code: string) {
  if (!/^\d{4}$/.test(code)) throw new Error("Invalid OTP format");
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
  await rateLimit("otp-global", 100, 3600);
  await rateLimit("otp-phone:" + hash(phone), 3, 900);
  const exists = Boolean(
    (await db().query("SELECT id FROM jdatna.users WHERE phone=$1", [phone]))
      .rowCount,
  );
  if (purpose === "signup" && exists)
    throw new HttpError(
      409,
      "الجوال مسجل؛ ادخل بكلمة المرور أو استخدم نسيت كلمة المرور",
    );
  if (purpose === "reset" && !exists)
    throw new HttpError(400, "لا يوجد حساب لهذا الجوال؛ أنشئ حسابًا جديدًا");
  const id = randomUUID(),
    code = createOtp();
  await db().query(
    "INSERT INTO jdatna.otp_challenges(id,phone,code_hash,expires_at,purpose) VALUES($1,$2,$3,now()+interval '5 minutes',$4)",
    [id, phone, otpHash(id, code), purpose],
  );
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
) {
  if (!registrationOpen()) throw new HttpError(503, "خدمة التحقق غير متاحة");
  await rateLimit("verify-global", 800, 3600);
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
            `INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,$3,now()) ON CONFLICT(phone) DO NOTHING RETURNING id,name,phone,role,username`,
            [randomUUID(), challenge.phone, name?.trim() || "مستخدم"],
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
      const token = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,setup_until,setup_only) VALUES($1,$2,now()+interval '10 minutes',now()+interval '10 minutes',true)",
        [hash(token), user.id],
      );
      return { user, token };
    },
  );
}
// دخول الإدارة بخطوتين: بعد صحة كلمة المرور يُرسل رمز إلى جوال المدير.
// ADMIN_LOGIN_OTP=off يعطّل الخطوة الثانية للطوارئ فقط (يتطلب وصولًا للخادم).
export function adminOtpRequired() {
  return process.env.ADMIN_LOGIN_OTP !== "off" && smsConfigured();
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
  await rateLimit("verify-global", 800, 3600);
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
          "SELECT id,name,phone,role,username,permissions FROM jdatna.users WHERE phone=$1 AND role IN ('admin','staff') AND suspended_at IS NULL AND phone_verified_at IS NOT NULL",
          [challenge.phone],
        )
      ).rows[0] as SessionUser | undefined;
      if (!user) return null;
      const token = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
        [hash(token), user.id],
      );
      return { user, token };
    },
  );
}
export const ADMIN_SESSION_SECONDS = 43200;
export function sessionCookie(token: string, maxAge = 604800) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function logout(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (token && databaseConfigured())
    await db().query("DELETE FROM jdatna.sessions WHERE token_hash=$1", [
      hash(token),
    ]);
}
