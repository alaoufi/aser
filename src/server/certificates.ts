import { randomUUID } from "node:crypto";
import type { SessionUser } from "../lib/types";
import { db, databaseConfigured } from "./db";

/** عدد التقييمات المطلوبة، وكلها يجب أن تكون 5 نجوم. */
export const CERTIFICATE_RATINGS = 10;

export type Certificate = {
  id: string;
  familyName: string;
  ratingsCount: number;
  issuedAt: string;
  producerSlug: string | null;
};

/** حالة تقييمات الأسرة: عددها، وهل كلها خمس نجوم. */
async function familyRatings(producerId: string) {
  const row = (
    await db().query(
      "SELECT count(*)::int AS total,COALESCE(min(stars),0)::int AS lowest FROM jdatna.ratings WHERE kind='family' AND target_id=$1",
      [producerId],
    )
  ).rows[0] as { total: number; lowest: number };
  return row;
}

/**
 * تُصدر الشهادة تلقائيًا عند بلوغ 10 تقييمات كلها 5 نجوم، مرة واحدة.
 * إن جاء بعدها تقييم أقل تبقى الشهادة كما صدرت بتاريخها.
 */
export async function awardIfEligible(producerId: string) {
  const { total, lowest } = await familyRatings(producerId);
  if (total < CERTIFICATE_RATINGS || lowest < 5) return null;
  await db().query(
    `INSERT INTO jdatna.certificates(id,producer_id,family_name,ratings_count)
     SELECT $1,p.id,COALESCE(p.trade_name,p.name),$3 FROM jdatna.producer_profiles p WHERE p.id=$2
     ON CONFLICT (producer_id) DO NOTHING`,
    [randomUUID(), producerId, total],
  );
  return true;
}

/** شهادة أسرة المستخدم وتقدّمها نحوها (للوحة الأسرة). */
export async function familyCertificate(user: SessionUser) {
  const family = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0] as { id: string } | undefined;
  if (!family) return { certificate: null, progress: null };
  // استدراك: أسرة استوفت الشرط قبل إطلاق الشهادات تحصل عليها عند فتح لوحتها.
  await awardIfEligible(family.id);
  const { total, lowest } = await familyRatings(family.id);
  const cert = (
    await db().query(
      `SELECT id,issued_at AS "issuedAt" FROM jdatna.certificates WHERE producer_id=$1`,
      [family.id],
    )
  ).rows[0] as { id: string; issuedAt: Date } | undefined;
  return {
    certificate: cert
      ? { id: cert.id, issuedAt: new Date(cert.issuedAt).toISOString() }
      : null,
    progress: {
      total,
      allFive: total > 0 && lowest === 5,
      needed: CERTIFICATE_RATINGS,
    },
  };
}

/** الشهادة للعرض العام بالرابط (تكريم علني لا يحمل بيانات خاصة). */
export async function getCertificate(id: string): Promise<Certificate | null> {
  if (!databaseConfigured() || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const row = (
    await db().query(
      `SELECT k.id,k.family_name AS "familyName",k.ratings_count AS "ratingsCount",k.issued_at AS "issuedAt",
         CASE WHEN p.status='approved' THEN p.slug END AS "producerSlug"
       FROM jdatna.certificates k JOIN jdatna.producer_profiles p ON p.id=k.producer_id WHERE k.id=$1`,
      [id],
    )
  ).rows[0];
  return row
    ? { ...row, issuedAt: new Date(row.issuedAt).toISOString() }
    : null;
}

/** أحدث الشهادات للإعلان في الرئيسية: آخر 30 يومًا، والأسر المعتمدة فقط. */
export async function recentCertificates(limit = 3) {
  if (!databaseConfigured()) return [];
  try {
    return (
      await db().query(
        `SELECT k.id,k.family_name AS "familyName" FROM jdatna.certificates k
         JOIN jdatna.producer_profiles p ON p.id=k.producer_id
         WHERE p.status='approved' AND k.issued_at > now() - interval '30 days'
         ORDER BY k.issued_at DESC LIMIT $1`,
        [limit],
      )
    ).rows as { id: string; familyName: string }[];
  } catch {
    return [];
  }
}
