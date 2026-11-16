import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";
import { can } from "../lib/permissions";
import { siteTextDefaults } from "../lib/site-texts";

export type RatingKind = "family" | "product" | "member" | "courier";
export type RatingSummary = { average: number | null; count: number };
export type RatingView = RatingSummary & {
  mine: { stars: number; comment: string } | null;
  canRate: boolean;
  /** «سبق لك تقييم…»: قيّم تعامله ولا تعامل جديدًا يتيح تقييمًا آخر. */
  rated?: string;
  /** نص القسم الذي يوافق عليه المقيِّم قبل الإرسال (من «نصوص الموقع»). */
  oath?: string;
};

/** نص القسم: المعدّل في «نصوص الموقع»، وإن حُذف أو أُخفي فالنص الأصلي؛ فالقسم لا يسقط. */
async function oathText(k: RatingKind) {
  const key =
    k === "member"
      ? "rating.oathMember"
      : k === "courier"
        ? "rating.oathCourier"
        : "rating.oath";
  try {
    const { getSiteTexts } = await import("./settings");
    return (await getSiteTexts())[key] || siteTextDefaults[key];
  } catch {
    return siteTextDefaults[key];
  }
}

const kind = z.enum(["family", "product", "member", "courier"]);
/** تعامل فعلي: طلب سلّمته الأسرة («تم التسليم»). قبل التسليم لا تقييم، فالقسم «تعاملت» لا يصح بعد. */
const dealt = "o.status='completed'";

export async function ratingSummary(
  k: RatingKind,
  targetId: string,
): Promise<RatingSummary> {
  if (!z.uuid().safeParse(targetId).success) return { average: null, count: 0 };
  const row = (
    await db().query(
      "SELECT round(avg(stars)::numeric,1)::float8 AS average,count(*)::int AS count FROM jdatna.ratings WHERE kind=$1 AND target_id=$2",
      [k, targetId],
    )
  ).rows[0];
  return { average: row.average, count: row.count };
}

/**
 * هل لهذا المستخدم تعامل لم يقيّمه بعد؟ التقييم مرة واحدة لكل تعامل (طلب مكتمل أو توصيل تم)،
 * والتعامل الجديد يتيح تقييمًا جديدًا. الإدارة تقيّم الأسرة والمندوب مرة واحدة دون طلب.
 * يُعيد صفة المقيِّم والطلب الذي يُنسب له التقييم، أو null.
 */
async function eligibility(
  user: SessionUser,
  k: RatingKind,
  targetId: string,
): Promise<{
  role: "member" | "admin" | "family";
  orderId: string | null;
} | null> {
  const unrated = (orderCol: string) =>
    `NOT EXISTS (SELECT 1 FROM jdatna.ratings r WHERE r.kind='${k}' AND r.target_id=$1 AND r.rater_id=$2 AND r.order_id=${orderCol})`;
  const first = async (sql: string) =>
    ((await db().query(sql, [targetId, user.id])).rows[0]?.id as
      string | undefined) ?? null;
  const adminOnce = async () =>
    (
      await db().query(
        "SELECT 1 FROM jdatna.ratings WHERE kind=$1 AND target_id=$2 AND rater_id=$3 AND order_id IS NULL",
        [k, targetId, user.id],
      )
    ).rowCount
      ? null
      : { role: "admin" as const, orderId: null };
  if (k === "family") {
    const family = (
      await db().query(
        "SELECT user_id FROM jdatna.producer_profiles WHERE id=$1 AND status='approved'",
        [targetId],
      )
    ).rows[0];
    if (!family || family.user_id === user.id) return null;
    const orderId = await first(
      `SELECT o.id FROM jdatna.order_requests o WHERE o.producer_id=$1 AND o.user_id=$2 AND ${dealt}
       AND ${unrated("o.id")} ORDER BY o.created_at LIMIT 1`,
    );
    if (orderId) return { role: "member", orderId };
    return can(user, "producers") ? adminOnce() : null;
  }
  if (k === "product") {
    const orderId = await first(
      `SELECT o.id FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       WHERE o.product_id=$1 AND o.user_id=$2 AND p.user_id<>$2 AND ${dealt}
       AND ${unrated("o.id")} ORDER BY o.created_at LIMIT 1`,
    );
    return orderId ? { role: "member", orderId } : null;
  }
  if (k === "courier") {
    // المندوب تقيّمه الأسرة عن كل توصيل تم لطلبها، والإدارة مرة واحدة.
    if (targetId === user.id) return null;
    const orderId = await first(
      `SELECT oc.order_id AS id FROM jdatna.order_couriers oc JOIN jdatna.order_requests o ON o.id=oc.order_id
       JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       WHERE oc.courier_user_id=$1 AND oc.status='delivered' AND p.user_id=$2
       AND ${unrated("oc.order_id")} ORDER BY oc.delivered_at LIMIT 1`,
    );
    if (orderId) return { role: "family", orderId };
    return can(user, "producers") ? adminOnce() : null;
  }
  // العضو تقيّمه الأسرة عن كل طلب مكتمل منه.
  if (targetId === user.id) return null;
  const orderId = await first(
    `SELECT o.id FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
     WHERE o.user_id=$1 AND p.user_id=$2 AND ${dealt}
     AND ${unrated("o.id")} ORDER BY o.created_at LIMIT 1`,
  );
  return orderId ? { role: "family", orderId } : null;
}

/** رسالة «سبق لك تقييم…» حسب نوع الهدف. */
export const ratedMessage: Record<RatingKind, string> = {
  product: "سبق لك تقييم هذا المنتج",
  family: "سبق لك تقييم هذه الأسرة",
  member: "سبق لك تقييم هذا العميل",
  courier: "سبق لك تقييم هذا المندوب",
};

/** تقييم العضو خاص: يراه من تعامل معه من الأسر، والإدارة. */
async function assertCanViewMember(user: SessionUser | null, targetId: string) {
  if (user && (can(user, "orders") || can(user, "producers"))) return;
  // الأسرة ترى تقييم العميل من أول طلب لم تُرفضه، لتقرر قبوله؛ أما التقييم نفسه فبعد التسليم.
  if (
    user &&
    targetId !== user.id &&
    (
      await db().query(
        `SELECT 1 FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
         WHERE o.user_id=$1 AND p.user_id=$2 AND o.status NOT IN ('declined','cancelled') LIMIT 1`,
        [targetId, user.id],
      )
    ).rowCount
  )
    return;
  throw new HttpError(403, "تقييم العضو للأسر المتعاملة معه فقط");
}

export async function ratingView(
  user: SessionUser | null,
  input: { kind: unknown; target: unknown },
): Promise<RatingView> {
  const k = kind.parse(input.kind);
  const targetId = z.uuid().parse(input.target);
  if (k === "member") await assertCanViewMember(user, targetId);
  const summary = await ratingSummary(k, targetId);
  if (!user) return { ...summary, mine: null, canRate: false };
  // آخر تقييم له على هذا الهدف (للعرض)، وهل له تعامل جديد لم يقيّمه.
  const mine =
    (
      await db().query(
        "SELECT stars,comment FROM jdatna.ratings WHERE kind=$1 AND target_id=$2 AND rater_id=$3 ORDER BY created_at DESC LIMIT 1",
        [k, targetId, user.id],
      )
    ).rows[0] ?? null;
  const canRate = Boolean(await eligibility(user, k, targetId));
  return {
    ...summary,
    mine,
    canRate,
    ...(canRate ? { oath: await oathText(k) } : {}),
    ...(!canRate && mine ? { rated: ratedMessage[k] } : {}),
  };
}

export async function rate(user: SessionUser, input: unknown) {
  const value = z
    .object({
      kind,
      target: z.uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).default(""),
      /** الموافقة على القسم شرط لقبول التقييم. */
      oath: z.literal(true, { error: "وافق على القسم قبل إرسال التقييم" }),
    })
    .strict()
    .parse(input);
  const eligible = await eligibility(user, value.kind, value.target);
  if (!eligible) {
    // قيّم تعامله السابق ولا تعامل جديد: رسالة واضحة، لا تقييم مكرر.
    const rated = (
      await db().query(
        "SELECT 1 FROM jdatna.ratings WHERE kind=$1 AND target_id=$2 AND rater_id=$3",
        [value.kind, value.target, user.id],
      )
    ).rowCount;
    if (rated) throw new HttpError(409, ratedMessage[value.kind]);
    throw new HttpError(403, "التقييم متاح بعد تسليم طلبك من الموقع");
  }
  const saved = await db().query(
    `INSERT INTO jdatna.ratings(id,kind,target_id,rater_id,rater_role,stars,comment,order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      value.kind,
      value.target,
      user.id,
      eligible.role,
      value.stars,
      value.comment,
      eligible.orderId,
    ],
  );
  // طلبان معًا لنفس التعامل: يُحفظ الأول فقط.
  if (!saved.rowCount) throw new HttpError(409, ratedMessage[value.kind]);
  if (value.kind === "family") {
    // التقييم العاشر بخمس نجوم يُصدر شهادة «أسرة مميزة»؛ تعذّر الإصدار لا يُفشل التقييم.
    const { awardIfEligible } = await import("./certificates");
    await awardIfEligible(value.target).catch(() => null);
  }
  return ratingSummary(value.kind, value.target);
}
