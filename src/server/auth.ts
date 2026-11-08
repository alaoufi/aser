import { createOtp } from "./otp";
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
  if (!databaseConfigured()) return null;
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (
    (
      await db().query(
        "SELECT u.id,u.name,u.phone,u.role FROM jdatna.sessions s JOIN jdatna.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [hash(token)],
      )
    ).rows[0] ?? null
  );
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
export async function requestOtp(phoneValue: string) {
  if (!registrationOpen())
    throw new HttpError(
      503,
      "التسجيل غير متاح حتى اعتماد خدمات التحقق وحفظ المستندات",
    );
  const phone = normalizePhone(phoneValue);
  await rateLimit("otp-global", 100, 3600);
  await rateLimit("otp-phone:" + hash(phone), 3, 900);
  const id = randomUUID(),
    code = createOtp();
  await db().query(
    "INSERT INTO jdatna.otp_challenges(id,phone,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')",
    [id, phone, otpHash(id, code)],
  );
  try {
    await sendSms(phone, `رمز التحقق لمنصة أكلات وغذاء الأجداد: ${code}`);
  } catch {
    await db().query("DELETE FROM jdatna.otp_challenges WHERE id=$1", [id]);
    throw new HttpError(503, "تعذر إرسال رمز التحقق");
  }
  return { challengeId: id };
}
export async function verifyOtp(id: string, code: string, name?: string) {
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
          `INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,$3,now()) ON CONFLICT(phone) DO UPDATE SET phone_verified_at=now() RETURNING id,name,phone,role`,
          [randomUUID(), challenge.phone, name?.trim() || "مستخدم"],
        )
      ).rows[0] as SessionUser;
      const token = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
        [hash(token), user.id],
      );
      return { user, token };
    },
  );
}
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
