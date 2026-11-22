import { randomInt } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { can } from "../lib/permissions";
import { SITE_URL } from "../lib/seo";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";
import { cleanPhone } from "./directory";

/**
 * «ادعُ صديقًا» (قرار المالك 2026-11-22):
 *   - لكل عضو رابط دعوة ثابت: jdtna.sa/r/رمز.
 *   - من يفتح الرابط ثم يسجل، أو يكتب رقم جوال من دعاه عند التسجيل، يُحسب لصاحب الدعوة
 *     بعد تأكيد جواله: مرة واحدة لكل حساب، ولا يدعو أحد نفسه.
 *   - «الرصيد» عددُ من سجلوا عن طريقه فقط (لأي حسابات مستقبلية يُتفاهم عليها).
 *   - الإدارة (المدير العام ومن أُعطي قسم «دعوات الأصدقاء») ترى الأعضاء وأرصدتهم، ومن سجل عن طريق كلٍّ.
 */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export const REF_COOKIE = "jdatna_ref";
export const codePattern = /^[2-9a-km-zA-HJ-NP-Z]{7}$/;
const newCode = () =>
  Array.from({ length: 7 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    "",
  );

/** رمز دعوة العضو (يُنشأ أول مرة ويبقى ثابتًا). */
export async function inviteCode(userId: string) {
  for (let i = 0; i < 5; i++) {
    const existing = (
      await db().query<{ code: string }>(
        "SELECT code FROM jdatna.referral_codes WHERE user_id=$1",
        [userId],
      )
    ).rows[0];
    if (existing) return existing.code;
    await db().query(
      "INSERT INTO jdatna.referral_codes(user_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [userId, newCode()],
    );
  }
  throw new HttpError(503, "تعذر إنشاء رابط الدعوة، حاول مرة أخرى");
}

export async function myInvite(user: SessionUser) {
  const code = await inviteCode(user.id);
  const count = (
    await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM jdatna.referrals WHERE referrer_id=$1",
      [user.id],
    )
  ).rows[0].n;
  return { code, link: `${SITE_URL}/r/${code}`, count };
}

/** هل الرمز لعضو قائم؟ (لصفحة /r/رمز قبل حفظه في الجهاز). */
export async function validInviteCode(code: string) {
  if (!codePattern.test(code)) return false;
  return Boolean(
    (
      await db().query(
        `SELECT 1 FROM jdatna.referral_codes r JOIN jdatna.users u ON u.id=r.user_id
         WHERE r.code=$1 AND u.deleted_at IS NULL`,
        [code],
      )
    ).rowCount,
  );
}

/**
 * يُستدعى داخل معاملة التسجيل بعد تأكيد الجوال: رقم من دعاه (إن كتبه) أولًا، وإلا رمز الرابط.
 * أي خطأ هنا لا يمنع التسجيل: الدعوة تُتجاهل بصمت.
 */
export async function recordReferral(
  client: PoolClient,
  newUserId: string,
  ref: { code?: string | null; phone?: string | null },
) {
  let referrer: string | undefined;
  let via: "link" | "phone" = "link";
  try {
    const phone = ref.phone ? cleanPhone(ref.phone) : null;
    if (phone) {
      referrer = (
        await client.query<{ id: string }>(
          "SELECT id FROM jdatna.users WHERE phone=$1 AND deleted_at IS NULL",
          [phone],
        )
      ).rows[0]?.id;
      via = "phone";
    }
  } catch {
    referrer = undefined;
  }
  if (!referrer && ref.code && codePattern.test(ref.code)) {
    referrer = (
      await client.query<{ id: string }>(
        `SELECT r.user_id AS id FROM jdatna.referral_codes r JOIN jdatna.users u ON u.id=r.user_id
         WHERE r.code=$1 AND u.deleted_at IS NULL`,
        [ref.code],
      )
    ).rows[0]?.id;
    via = "link";
  }
  if (!referrer || referrer === newUserId) return false;
  const r = await client.query(
    // مرة واحدة لكل حساب، ولحساب جديد فقط (لم يُحسب من قبل).
    "INSERT INTO jdatna.referrals(referred_id,referrer_id,via) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [newUserId, referrer, via],
  );
  return Boolean(r.rowCount);
}

function assertInvites(user: SessionUser) {
  if (!can(user, "invites"))
    throw new HttpError(403, "دعوات الأصدقاء ليست ضمن أقسامك في الإدارة.");
}

/** الإدارة: كل من دعا أحدًا، برصيده (عدد من سجلوا عن طريقه)، الأكثر أولًا. */
export async function adminReferrers(user: SessionUser) {
  assertInvites(user);
  return (
    await db().query<{
      id: string;
      name: string;
      phone: string;
      count: number;
      byLink: number;
      byPhone: number;
      last: string;
    }>(
      `SELECT u.id,COALESCE(p.trade_name,p.name,u.name) AS name,u.phone,
         count(*)::int AS count,
         count(*) FILTER (WHERE r.via='link')::int AS "byLink",
         count(*) FILTER (WHERE r.via='phone')::int AS "byPhone",
         max(r.created_at) AS last
       FROM jdatna.referrals r
       JOIN jdatna.users u ON u.id=r.referrer_id
       LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id
       GROUP BY u.id,p.trade_name,p.name,u.name,u.phone
       ORDER BY count(*) DESC,max(r.created_at) DESC LIMIT 1000`,
    )
  ).rows;
}

/** الإدارة: من سجل عن طريق عضو بعينه، بأسمائهم وأرقامهم. */
export async function adminReferred(user: SessionUser, referrerId: string) {
  assertInvites(user);
  if (!z.uuid().safeParse(referrerId).success)
    throw new HttpError(404, "غير موجود");
  const referrer = (
    await db().query<{ name: string; phone: string }>(
      `SELECT COALESCE(p.trade_name,p.name,u.name) AS name,u.phone FROM jdatna.users u
       LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id WHERE u.id=$1`,
      [referrerId],
    )
  ).rows[0];
  if (!referrer) throw new HttpError(404, "غير موجود");
  const people = (
    await db().query<{
      name: string;
      phone: string;
      role: string;
      via: "link" | "phone";
      createdAt: string;
    }>(
      `SELECT COALESCE(p.trade_name,p.name,u.name) AS name,u.phone,u.role,r.via,r.created_at AS "createdAt"
       FROM jdatna.referrals r JOIN jdatna.users u ON u.id=r.referred_id
       LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id
       WHERE r.referrer_id=$1 ORDER BY r.created_at DESC LIMIT 2000`,
      [referrerId],
    )
  ).rows;
  return { referrer, people };
}
