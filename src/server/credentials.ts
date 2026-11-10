import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { transaction } from "./db";
import {
  adminOtpRequired,
  hash,
  rateLimit,
  sessionToken,
  startAdminChallenge,
} from "./auth";
import { HttpError, normalizePhone } from "./security";
const passwordSchema = z
  .string()
  .min(4, "كلمة المرور أربع خانات على الأقل")
  .max(128, "كلمة المرور طويلة جدًا");
export const ADMIN_PASSWORD_MIN = 10;
export function normalizeUsername(input: string) {
  const value = input.trim().normalize("NFC").toLowerCase().normalize("NFC");
  let phoneAlias = false;
  try {
    normalizePhone(value);
    phoneAlias = true;
  } catch {}
  if (
    !/^[\p{L}\p{N}._-]{3,40}$/u.test(value) ||
    phoneAlias ||
    /^(?:0?5\d{8}|9665\d{8})$/.test(value)
  )
    throw new HttpError(
      400,
      "اسم المستخدم من 3 إلى 40 حرفًا أو رقمًا أو . _ - ولا يكون رقم جوال",
    );
  return value;
}
export const credentialsSchema = z
  .object({
    password: passwordSchema,
    username: z.string().max(160).nullable().optional(),
  })
  .strict();
// OWASP's 32 MiB scrypt configuration balances memory with CPU work.
const hashPattern = /^scrypt\$32768\$8\$3\$([0-9a-f]{32})\$([0-9a-f]{128})$/;
const dummyHash = `scrypt$32768$8$3$${"0".repeat(32)}$${"0".repeat(128)}`;
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
) {
  if (!passwordSchema.safeParse(password).success) return false;
  const valid = typeof stored === "string" ? hashPattern.exec(stored) : null;
  const parsed = valid ?? hashPattern.exec(dummyHash)!;
  const key = await derive(password, parsed[1]);
  return timingSafeEqual(key, Buffer.from(parsed[2], "hex")) && Boolean(valid);
}
export function roleDestination(role: SessionUser["role"]) {
  return role === "admin"
    ? "/admin"
    : role === "producer"
      ? "/dashboard"
      : "/orders";
}
export async function passwordLogin(input: unknown) {
  const value = z
    .object({
      identifier: z.string().trim().min(1).max(160),
      password: passwordSchema,
    })
    .strict()
    .parse(input);
  let identifier = value.identifier.normalize("NFC").toLowerCase(),
    phone = false,
    validIdentifier = true;
  try {
    identifier = normalizePhone(value.identifier);
    phone = true;
  } catch {
    try {
      identifier = normalizeUsername(value.identifier);
    } catch {
      validIdentifier = false;
    }
  }
  await rateLimit("password-login-global", 600, 3600);
  await rateLimit("password-login:" + hash(identifier), 10, 900);
  return transaction(async (client) => {
    const row = validIdentifier
      ? (
          await client.query(
            `SELECT id,name,phone,role,username,permissions,password_hash,suspended_at FROM jdatna.users WHERE ${phone ? "phone" : "username"}=$1 AND phone_verified_at IS NOT NULL FOR UPDATE`,
            [identifier],
          )
        ).rows[0]
      : null;
    const matches = await verifyPassword(value.password, row?.password_hash);
    if (!row || !matches)
      throw new HttpError(401, "اسم الدخول أو كلمة المرور غير صحيحة");
    const {
      password_hash: _,
      suspended_at: suspended,
      ...user
    } = row as SessionUser & {
      password_hash: string;
      suspended_at: string | null;
    };
    if (suspended)
      throw new HttpError(403, "هذا الحساب موقوف؛ تواصل مع إدارة المنصة");
    // المدير والمشرف يدخلان بخطوتين: كلمة المرور ثم رمز الجوال.
    if (
      (user.role === "admin" || Boolean(user.permissions?.length)) &&
      adminOtpRequired()
    ) {
      // لا جلسة قبل رمز الجوال لحساب الإدارة.
      const challengeId = await startAdminChallenge(client, user.phone);
      return {
        otp: { challengeId },
        user: null,
        token: null,
        next: roleDestination(user.role),
      };
    }
    const token = randomBytes(32).toString("hex");
    await client.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hash(token), user.id],
    );
    return { user, token, next: roleDestination(user.role) };
  });
}
export async function setCredentials(request: Request, input: unknown) {
  const token = sessionToken(request);
  if (!token) throw new HttpError(401, "يرجى تسجيل الدخول");
  const value = credentialsSchema.parse(input);
  const username =
    value.username === undefined
      ? undefined
      : value.username === null
        ? null
        : normalizeUsername(value.username);
  await rateLimit("credentials-global", 300, 3600);
  await rateLimit("credentials:" + hash(token), 10, 900);
  try {
    return await transaction(async (client) => {
      // Lock the identity before rotating/deleting sessions, matching password-login lock order.
      const identity = (
        await client.query(
          "SELECT user_id FROM jdatna.sessions WHERE token_hash=$1 AND expires_at>now()",
          [hash(token)],
        )
      ).rows[0];
      if (!identity) throw new HttpError(401, "يرجى تسجيل الدخول");
      await client.query("SELECT id FROM jdatna.users WHERE id=$1 FOR UPDATE", [
        identity.user_id,
      ]);
      const proof = (
        await client.query(
          "SELECT user_id,(setup_only AND setup_until>now()) AS fresh FROM jdatna.sessions WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (!proof?.fresh)
        throw new HttpError(403, "يلزم تحقق جديد بالجوال لتعيين كلمة المرور");
      const role = (
        await client.query(
          "SELECT role,cardinality(permissions) AS perms FROM jdatna.users WHERE id=$1",
          [proof.user_id],
        )
      ).rows[0];
      if (
        (role?.role === "admin" || role?.perms > 0) &&
        value.password.length < ADMIN_PASSWORD_MIN
      )
        throw new HttpError(
          400,
          `كلمة مرور الإدارة ${ADMIN_PASSWORD_MIN} خانات على الأقل`,
        );
      const passwordHash = await hashPassword(value.password);
      const user = (
        await client.query(
          "UPDATE jdatna.users SET password_hash=$2,username=CASE WHEN $4 THEN $3 ELSE username END WHERE id=$1 RETURNING id,name,phone,role,username",
          [
            proof.user_id,
            passwordHash,
            username ?? null,
            username !== undefined,
          ],
        )
      ).rows[0] as SessionUser;
      await client.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [
        user.id,
      ]);
      const freshToken = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
        [hash(freshToken), user.id],
      );
      return { user, token: freshToken, next: roleDestination(user.role) };
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      throw new HttpError(409, "اسم المستخدم مستخدم، اختر اسمًا آخر");
    throw error;
  }
}
