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
 *   - لكل عضو رابط دعوة برقمه: jdtna.sa/r/241.
 *   - من يفتح الرابط ثم يسجل، أو يكتب «رقم الدعوة» (رقم العضو أو جواله) عند التسجيل، يُحسب لصاحب الدعوة
 *     بعد تأكيد جواله: مرة واحدة لكل حساب، ولا يدعو أحد نفسه.
 *   - «الرصيد» عددُ من سجلوا عن طريقه فقط (لأي حسابات مستقبلية يُتفاهم عليها).
 *   - الإدارة (المدير العام ومن أُعطي قسم «دعوات الأصدقاء») ترى الأعضاء وأرصدتهم، ومن سجل عن طريق كلٍّ.
 */
export const REF_COOKIE = "jdatna_ref";
/** رقم العضو كما يُكتب في رابط الدعوة أو خانة «رقم الدعوة» (أرقام فقط، حتى 7). */
export const invitePattern = /^[0-9]{1,7}$/;
const ascii = (v: string) =>
  v.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** صاحب رقم العضو: رقمه الحالي، أو رقم قديم له غيّرته الإدارة (يبقى له). */
async function ownerOfNumber(
  q: { query: PoolClient["query"] } | ReturnType<typeof db>,
  value: string,
) {
  const n = ascii(value);
  if (!invitePattern.test(n)) return undefined;
  return (
    await q.query<{ id: string }>(
      `SELECT u.id FROM jdatna.users u WHERE u.deleted_at IS NULL AND (
         u.member_no=$1::int OR u.id=(SELECT h.user_id FROM jdatna.member_no_history h WHERE h.member_no=$1::int))
       LIMIT 1`,
      [n],
    )
  ).rows[0]?.id;
}

export async function myInvite(user: SessionUser) {
  const row = (
    await db().query<{ memberNo: number; count: number }>(
      `SELECT u.member_no AS "memberNo",
         (SELECT count(*)::int FROM jdatna.referrals r WHERE r.referrer_id=u.id) AS count
       FROM jdatna.users u WHERE u.id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "الحساب غير موجود");
  return {
    memberNo: row.memberNo,
    link: `${SITE_URL}/r/${row.memberNo}`,
    count: row.count,
  };
}

/** هل رقم الدعوة لعضو قائم؟ (لصفحة /r/رقم قبل حفظه في الجهاز). */
export async function validInvite(value: string) {
  return Boolean(await ownerOfNumber(db(), value));
}

/**
 * يُستدعى داخل معاملة التسجيل بعد تأكيد الجوال. «رقم الدعوة» الذي كتبه (رقم عضو، أو جوال) أولًا،
 * وإلا رقم رابط الدعوة المحفوظ في الجهاز. أي خطأ هنا لا يمنع التسجيل: الدعوة تُتجاهل.
 */
export async function recordReferral(
  client: PoolClient,
  newUserId: string,
  ref: { invite?: string | null; link?: string | null },
) {
  let referrer: string | undefined;
  let via: "link" | "number" | "phone" = "link";
  const typed = ref.invite ? ascii(ref.invite).replace(/[\s\-]/g, "") : "";
  if (typed) {
    if (invitePattern.test(typed)) {
      referrer = await ownerOfNumber(client, typed);
      via = "number";
    } else {
      try {
        const phone = cleanPhone(typed);
        referrer = phone
          ? (
              await client.query<{ id: string }>(
                "SELECT id FROM jdatna.users WHERE phone=$1 AND deleted_at IS NULL",
                [phone],
              )
            ).rows[0]?.id
          : undefined;
        via = "phone";
      } catch {
        referrer = undefined;
      }
    }
  }
  if (!referrer && ref.link) {
    referrer = await ownerOfNumber(client, ref.link);
    via = "link";
  }
  if (!referrer || referrer === newUserId) return false;
  const r = await client.query(
    // مرة واحدة لكل حساب.
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
      memberNo: number;
      name: string;
      phone: string;
      count: number;
      byLink: number;
      byNumber: number;
      last: string;
    }>(
      `SELECT u.id,u.member_no AS "memberNo",
         COALESCE(p.trade_name,p.name,u.name) AS name,u.phone,
         count(*)::int AS count,
         count(*) FILTER (WHERE r.via='link')::int AS "byLink",
         count(*) FILTER (WHERE r.via<>'link')::int AS "byNumber",
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
    await db().query<{ name: string; phone: string; memberNo: number }>(
      `SELECT COALESCE(p.trade_name,p.name,u.name) AS name,u.phone,u.member_no AS "memberNo" FROM jdatna.users u
       LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id WHERE u.id=$1`,
      [referrerId],
    )
  ).rows[0];
  if (!referrer) throw new HttpError(404, "غير موجود");
  const people = (
    await db().query<{
      memberNo: number;
      name: string;
      phone: string;
      role: string;
      via: "link" | "number" | "phone";
      createdAt: string;
    }>(
      `SELECT u.member_no AS "memberNo",COALESCE(p.trade_name,p.name,u.name) AS name,u.phone,u.role,r.via,r.created_at AS "createdAt"
       FROM jdatna.referrals r JOIN jdatna.users u ON u.id=r.referred_id
       LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id
       WHERE r.referrer_id=$1 ORDER BY r.created_at DESC LIMIT 2000`,
      [referrerId],
    )
  ).rows;
  return { referrer, people };
}
