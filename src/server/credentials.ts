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
  SESSION_EXPIRY,
} from "./auth";
import { HttpError, normalizePhone } from "./security";
import { toAsciiDigits } from "../lib/digits";
const passwordSchema = z
  .string()
  .min(4, "كلمة المرور أربع خانات على الأقل")
  .max(128, "كلمة المرور طويلة جدًا");
/** كلمة مرور الإدارة كغيرها: أربع خانات على الأقل (قرار المالك 2026-11-14). */
export const ADMIN_PASSWORD_MIN = 4;
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
  // تُحفظ بأرقام لاتينية، فتطابق «١٢٣٤» و«1234» أيًّا كانت لوحة المفاتيح عند الدخول.
  password = toAsciiDigits(password);
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
  const matches = async (candidate: string) =>
    timingSafeEqual(
      await derive(candidate, parsed[1]),
      Buffer.from(parsed[2], "hex"),
    );
  // بالأرقام اللاتينية أولًا (الحفظ الحالي)، ثم كما كُتبت (كلمات حُفظت قبل التوحيد بأرقام عربية).
  const ascii = toAsciiDigits(password);
  if (await matches(ascii)) return Boolean(valid);
  return ascii !== password && (await matches(password)) && Boolean(valid);
}
export function roleDestination(role: SessionUser["role"]) {
  return role === "admin"
    ? "/admin"
    : role === "producer"
      ? "/dashboard"
      : role === "courier"
        ? "/courier"
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
  // الحدود الثلاثة تُحسب معًا (كلها تُعدّ دائمًا)، لا واحدًا بعد الآخر.
  // السقف اليومي لكل حساب: كلمات المرور القصيرة (أربع خانات) لا تُخمَّن بالمحاولات المتواصلة.
  // صاحب الحساب يعود في اليوم التالي أو يستعيد كلمة المرور برمز الجوال.
  await Promise.all([
    rateLimit("password-login-global", 600, 3600),
    rateLimit("password-login:" + hash(identifier), 10, 900),
    rateLimit("password-login-day:" + hash(identifier), 30, 86400),
  ]);
  // المحاولة الخاطئة تُحفظ (لا تتراجع مع الخطأ)، ثم يُرمى الخطأ بعد إنهاء المعاملة.
  const outcome = await transaction(async (client) => {
    const row = validIdentifier
      ? (
          await client.query(
            `SELECT id,name,phone,role,username,permissions,password_hash,suspended_at,failed_logins,login_locked_at,
               (SELECT COALESCE(p.trade_name,p.name) FROM jdatna.producer_profiles p WHERE p.user_id=users.id) AS "familyName"
             FROM jdatna.users WHERE ${phone ? "phone" : "username"}=$1 AND phone_verified_at IS NOT NULL FOR UPDATE`,
            [identifier],
          )
        ).rows[0]
      : null;
    const matches = await verifyPassword(value.password, row?.password_hash);
    // حساب مقفل: لا دخول حتى بكلمة المرور الصحيحة؛ يُفتح باستعادة كلمة المرور.
    if (row?.login_locked_at)
      return { fail: "locked" as const, userId: row.id as string, just: false };
    if (!row || !matches) {
      if (!row) return { fail: "wrong" as const, userId: null, just: false };
      const r = (
        await client.query(
          `UPDATE jdatna.users SET failed_logins=failed_logins+1,
             login_locked_at=CASE WHEN failed_logins+1>=$2 THEN now() ELSE NULL END
           WHERE id=$1 RETURNING login_locked_at`,
          [row.id, LOGIN_LOCK_AFTER],
        )
      ).rows[0];
      return r.login_locked_at
        ? { fail: "locked" as const, userId: row.id as string, just: true }
        : { fail: "wrong" as const, userId: row.id as string, just: false };
    }
    const {
      password_hash: _,
      suspended_at: suspended,
      failed_logins: __,
      login_locked_at: ___,
      ...user
    } = row as SessionUser & {
      password_hash: string;
      suspended_at: string | null;
      failed_logins: number;
      login_locked_at: string | null;
    };
    // دخول صحيح: يُصفَّر عدّاد المحاولات الخاطئة.
    if (row.failed_logins)
      await client.query(
        "UPDATE jdatna.users SET failed_logins=0 WHERE id=$1",
        [user.id],
      );
    if (suspended)
      throw new HttpError(403, "هذا الحساب موقوف؛ تواصل مع إدارة المنصة");
    // دخول صحيح: يُصفَّر العداد اليومي، فلا يُقفل صاحب الحساب بدخوله المعتاد.
    await client.query("DELETE FROM jdatna.rate_limits WHERE key=$1", [
      "password-login-day:" + hash(identifier),
    ]);
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
      `INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,${SESSION_EXPIRY})`,
      [hash(token), user.id],
    );
    return { user, token, next: roleDestination(user.role) };
  });
  if ("fail" in outcome) {
    // userId وjustLocked للسجل الأمني في الخادم فقط، خارج details فلا تصل للمتصفح.
    if (outcome.fail === "locked")
      throw Object.assign(
        new HttpError(
          423,
          "قُفل الحساب بعد 5 محاولات دخول خاطئة. استعد كلمة المرور من «نسيت كلمة المرور» برمز يصل جوالك.",
          { locked: true },
        ),
        { justLocked: outcome.just, userId: outcome.userId },
      );
    throw Object.assign(
      new HttpError(401, "اسم الدخول أو كلمة المرور غير صحيحة"),
      { userId: outcome.userId },
    );
  }
  return outcome;
}
/** عدد المحاولات الخاطئة المتتالية الذي يُقفل بعده الحساب (طلب المالك). */
export const LOGIN_LOCK_AFTER = 5;
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
      const passwordHash = await hashPassword(value.password);
      const user = (
        await client.query(
          // استعادة كلمة المرور برمز الجوال تفتح الحساب المقفل وتصفّر المحاولات.
          "UPDATE jdatna.users SET password_hash=$2,failed_logins=0,login_locked_at=NULL,username=CASE WHEN $4 THEN $3 ELSE username END WHERE id=$1 RETURNING id,name,phone,role,username",
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
        `INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,${SESSION_EXPIRY})`,
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

/**
 * «معلوماتي»: تعديل الاسم، وتغيير كلمة المرور بالكلمة الحالية. تغيير كلمة المرور يُخرج
 * الأجهزة الأخرى ويُبقي الجهاز الحالي.
 */
export async function updateMyAccount(
  user: SessionUser,
  request: Request,
  input: unknown,
) {
  const value = z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "الاسم حرفان على الأقل")
        .max(120)
        .optional(),
      currentPassword: z.string().max(128).optional(),
      newPassword: passwordSchema.optional(),
    })
    .strict()
    .parse(input);
  await rateLimit("my-account:" + user.id, 20, 3600);
  return transaction(async (client) => {
    if (value.newPassword !== undefined) {
      const row = (
        await client.query(
          "SELECT password_hash FROM jdatna.users WHERE id=$1 FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      if (
        !(await verifyPassword(value.currentPassword ?? "", row?.password_hash))
      )
        throw new HttpError(400, "كلمة المرور الحالية غير صحيحة");
      await client.query(
        "UPDATE jdatna.users SET password_hash=$2,failed_logins=0,login_locked_at=NULL WHERE id=$1",
        [user.id, await hashPassword(value.newPassword)],
      );
      const token = sessionToken(request);
      await client.query(
        "DELETE FROM jdatna.sessions WHERE user_id=$1 AND token_hash<>$2",
        [user.id, token ? hash(token) : ""],
      );
    }
    if (value.name !== undefined)
      await client.query("UPDATE jdatna.users SET name=$2 WHERE id=$1", [
        user.id,
        value.name,
      ]);
    return (
      await client.query(
        "SELECT id,name,phone,role,username FROM jdatna.users WHERE id=$1",
        [user.id],
      )
    ).rows[0] as SessionUser;
  });
}
