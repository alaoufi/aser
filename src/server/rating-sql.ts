/**
 * متوسط التقييم وعدده بالمقيِّمين لا بالتقييمات (مراجعة أمنية 2026-11-25):
 * لكل مقيِّم صوت واحد (متوسط تقييماته)، فلا يرفع حساب واحد المتوسط أو العدد بطلبات متكررة.
 */
export type RatingSqlKind = "family" | "product" | "member" | "courier";
export const ratingAverageSql = (kind: RatingSqlKind, target: string) =>
  `(SELECT round(avg(v.a)::numeric,1)::float8 FROM (SELECT avg(g.stars) AS a FROM jdatna.ratings g WHERE g.kind='${kind}' AND g.target_id=${target} GROUP BY g.rater_id) v)`;
export const ratingCountSql = (kind: RatingSqlKind, target: string) =>
  `(SELECT count(DISTINCT g.rater_id)::int FROM jdatna.ratings g WHERE g.kind='${kind}' AND g.target_id=${target})`;
