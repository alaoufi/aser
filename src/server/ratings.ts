import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";
import { can } from "../lib/permissions";

export type RatingKind = "family" | "product" | "member";
export type RatingSummary = { average: number | null; count: number };
export type RatingView = RatingSummary & {
  mine: { stars: number; comment: string } | null;
  canRate: boolean;
};

const kind = z.enum(["family", "product", "member"]);
/** تعامل فعلي: طلب لم يُرفض ولم يُلغَ. */
const dealt = "o.status NOT IN ('declined','cancelled')";

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

/** هل لهذا المستخدم أن يقيّم الهدف؟ وبأي صفة؟ */
async function eligibility(
  user: SessionUser,
  k: RatingKind,
  targetId: string,
): Promise<"member" | "admin" | "family" | null> {
  if (k === "family") {
    const family = (
      await db().query(
        "SELECT user_id FROM jdatna.producer_profiles WHERE id=$1 AND status='approved'",
        [targetId],
      )
    ).rows[0];
    if (!family || family.user_id === user.id) return null;
    if (can(user, "producers")) return "admin";
    const ok = (
      await db().query(
        `SELECT 1 FROM jdatna.order_requests o WHERE o.producer_id=$1 AND o.user_id=$2 AND ${dealt} LIMIT 1`,
        [targetId, user.id],
      )
    ).rowCount;
    return ok ? "member" : null;
  }
  if (k === "product") {
    const ok = (
      await db().query(
        `SELECT 1 FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
         WHERE o.product_id=$1 AND o.user_id=$2 AND p.user_id<>$2 AND ${dealt} LIMIT 1`,
        [targetId, user.id],
      )
    ).rowCount;
    return ok ? "member" : null;
  }
  // العضو تقيّمه الأسرة التي تعاملت معه.
  if (targetId === user.id) return null;
  const ok = (
    await db().query(
      `SELECT 1 FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       WHERE o.user_id=$1 AND p.user_id=$2 AND ${dealt} LIMIT 1`,
      [targetId, user.id],
    )
  ).rowCount;
  return ok ? "family" : null;
}

/** تقييم العضو خاص: يراه من تعامل معه من الأسر، والإدارة. */
async function assertCanViewMember(user: SessionUser | null, targetId: string) {
  if (user && (can(user, "orders") || can(user, "producers"))) return;
  if (user && (await eligibility(user, "member", targetId))) return;
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
  const mine =
    (
      await db().query(
        "SELECT stars,comment FROM jdatna.ratings WHERE kind=$1 AND target_id=$2 AND rater_id=$3",
        [k, targetId, user.id],
      )
    ).rows[0] ?? null;
  return {
    ...summary,
    mine,
    canRate: Boolean(await eligibility(user, k, targetId)),
  };
}

export async function rate(user: SessionUser, input: unknown) {
  const value = z
    .object({
      kind,
      target: z.uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).default(""),
    })
    .strict()
    .parse(input);
  const role = await eligibility(user, value.kind, value.target);
  if (!role)
    throw new HttpError(
      403,
      "التقييم متاح بعد التعامل الفعلي عبر طلب في الموقع",
    );
  await db().query(
    `INSERT INTO jdatna.ratings(id,kind,target_id,rater_id,rater_role,stars,comment) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(kind,target_id,rater_id) DO UPDATE SET stars=EXCLUDED.stars,comment=EXCLUDED.comment,rater_role=EXCLUDED.rater_role,updated_at=now()`,
    [
      randomUUID(),
      value.kind,
      value.target,
      user.id,
      role,
      value.stars,
      value.comment,
    ],
  );
  return ratingSummary(value.kind, value.target);
}
