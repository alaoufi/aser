import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * إحصاءات الإدارة الرئيسية (طلب المالك 2026-11-25): مربعات مفصّلة يُبنى عليها التوقع والتسويق،
 * وتُصدَّر PDF من المتصفح. للمدير الكامل فقط. تُستبعد حسابات مراجعة المتاجر وأسرها.
 * القيمة التقديرية للطلب: السعر (أو سعر العرض) × الكمية × عدد الأيام، كما حُفظ وقت الطلب.
 */
export type Row = {
  label: string | number;
  value: number;
  amount?: number;
  raters?: number;
};
export const insightsRange = z.coerce
  .number()
  .int()
  .refine((d) => [7, 30, 90, 365].includes(d), "مدة غير مدعومة");

/** الطلبات الحقيقية مع قيمتها ومنطقتها (بلا حسابات المراجعة). */
const ORDERS = `orders AS (
  SELECT o.id,o.user_id,o.phone,o.producer_id,o.product_id,o.status,o.meal,o.created_at,o.producer_seen_at,
    c.region_id,
    COALESCE((o.snapshot->'offer'->>'price')::numeric,(o.snapshot->>'price')::numeric,0)
      * o.quantity * GREATEST(COALESCE(o.end_date-o.start_date+1,1),1) AS value
  FROM jdatna.order_requests o
  JOIN jdatna.producer_profiles p ON p.id=o.producer_id
  LEFT JOIN jdatna.cities c ON c.id=p.city_id
  LEFT JOIN jdatna.users u ON u.id=o.user_id
  WHERE NOT COALESCE(p.review_only,false) AND NOT COALESCE(u.review_account,false))`;
const REAL_USERS = `real_users AS (
  SELECT id,role,created_at FROM jdatna.users WHERE deleted_at IS NULL AND NOT COALESCE(review_account,false))`;

/** مؤشرات فترة: من (days+shift) يومًا مضت إلى shift يومًا مضت. */
async function periodStats(days: number, shift: number) {
  return (
    await db().query(
      `WITH ${ORDERS}, ${REAL_USERS},
        w AS (SELECT now()-($1::int+$2::int)*interval '1 day' AS a, now()-$2::int*interval '1 day' AS b)
       SELECT
        (SELECT count(*) FROM orders,w WHERE created_at>=w.a AND created_at<w.b)::int AS orders,
        (SELECT count(*) FROM orders,w WHERE created_at>=w.a AND created_at<w.b AND status='completed')::int AS completed,
        (SELECT count(*) FROM orders,w WHERE created_at>=w.a AND created_at<w.b AND status IN ('declined','cancelled'))::int AS lost,
        (SELECT COALESCE(sum(value),0) FROM orders,w WHERE created_at>=w.a AND created_at<w.b AND status NOT IN ('declined','cancelled'))::float8 AS value,
        (SELECT count(DISTINCT COALESCE(user_id::text,phone)) FROM orders,w WHERE created_at>=w.a AND created_at<w.b)::int AS customers,
        (SELECT count(*) FROM real_users,w WHERE created_at>=w.a AND created_at<w.b)::int AS members,
        (SELECT count(*) FROM jdatna.producer_profiles p,w WHERE p.created_at>=w.a AND p.created_at<w.b AND NOT COALESCE(p.review_only,false))::int AS families,
        (SELECT count(*) FROM jdatna.referrals r,w WHERE r.created_at>=w.a AND r.created_at<w.b)::int AS referrals,
        (SELECT count(*) FROM jdatna.conversations c,w WHERE c.created_at>=w.a AND c.created_at<w.b)::int AS conversations,
        (SELECT count(*) FROM jdatna.messages m,w WHERE m.created_at>=w.a AND m.created_at<w.b)::int AS messages,
        (SELECT count(*) FROM jdatna.ratings g,w WHERE g.created_at>=w.a AND g.created_at<w.b AND g.kind IN ('family','product'))::int AS ratings,
        (SELECT round(avg(stars)::numeric,1)::float8 FROM jdatna.ratings g,w WHERE g.created_at>=w.a AND g.created_at<w.b AND g.kind IN ('family','product')) AS stars,
        (SELECT count(*) FROM jdatna.subscription_requests s,w WHERE s.created_at>=w.a AND s.created_at<w.b)::int AS subscriptions,
        (SELECT count(*) FROM jdatna.customer_requests q,w WHERE q.created_at>=w.a AND q.created_at<w.b)::int AS requests,
        (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM producer_seen_at-created_at)/3600))::numeric,1)::float8
           FROM orders,w WHERE created_at>=w.a AND created_at<w.b AND producer_seen_at IS NOT NULL) AS "responseHours"`,
      [days, shift],
    )
  ).rows[0] as Record<string, number | null>;
}

/** ميل خط الاتجاه (مربعات صغرى) للتوقع: يُرجع قيمة النقطة التالية بعد السلسلة. */
export function linearNext(values: number[], ahead = 1) {
  const n = values.length;
  if (n < 2) return values[0] ?? 0;
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return Math.max(0, my + slope * (n - 1 + ahead - mx));
}

export async function adminInsights(user: SessionUser, daysInput: unknown) {
  if (user.role !== "admin")
    throw new HttpError(403, "الإحصاءات للمدير الكامل فقط");
  const days = insightsRange.parse(daysInput ?? 30);
  const q = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => (await db().query(sql, params)).rows as T[];
  const [current, previous] = await Promise.all([
    periodStats(days, 0),
    periodStats(days, days),
  ]);
  const totals = (
    await q(
      `WITH ${REAL_USERS} SELECT
        (SELECT count(*) FROM real_users WHERE role='customer')::int AS customers,
        (SELECT count(*) FROM jdatna.producer_profiles WHERE status='approved' AND NOT COALESCE(review_only,false))::int AS families,
        (SELECT count(*) FROM jdatna.products WHERE visible AND deleted_at IS NULL AND status<>'unavailable')::int AS products,
        (SELECT count(*) FROM jdatna.courier_profiles WHERE status='approved' AND active)::int AS couriers`,
    )
  )[0];
  // العملاء العائدون: من طلب في الفترة وله طلبان أو أكثر في كل تاريخه.
  const repeat = (
    await q<{ rate: number | null }>(
      `WITH ${ORDERS}, buyers AS (
         SELECT COALESCE(user_id::text,phone) AS who FROM orders WHERE created_at>=now()-$1::int*interval '1 day' GROUP BY 1)
       SELECT round(100.0*count(*) FILTER (WHERE n>=2)/NULLIF(count(*),0),0)::float8 AS rate
       FROM (SELECT b.who,(SELECT count(*) FROM orders o WHERE COALESCE(o.user_id::text,o.phone)=b.who) AS n FROM buyers b) t`,
      [days],
    )
  )[0]?.rate;
  // آخر 12 أسبوعًا (بتوقيت الرياض): الطلبات والأعضاء الجدد، للرسم والتوقع.
  const weekly = await q<{ week: string; orders: number; members: number }>(
    `WITH ${ORDERS}, ${REAL_USERS},
       weeks AS (SELECT generate_series(date_trunc('week',(now() AT TIME ZONE 'Asia/Riyadh'))-interval '11 weeks',
                  date_trunc('week',(now() AT TIME ZONE 'Asia/Riyadh')),interval '1 week') AS w)
     SELECT to_char(w,'YYYY-MM-DD') AS week,
       (SELECT count(*) FROM orders o WHERE date_trunc('week',o.created_at AT TIME ZONE 'Asia/Riyadh')=w)::int AS orders,
       (SELECT count(*) FROM real_users u WHERE date_trunc('week',u.created_at AT TIME ZONE 'Asia/Riyadh')=w)::int AS members
     FROM weeks ORDER BY w`,
  );
  const window = "created_at>=now()-$1::int*interval '1 day'";
  const [regions, categories, meals, weekdays, hours] = await Promise.all([
    q<Row>(
      `WITH ${ORDERS} SELECT COALESCE(r.name,'غير محدد') AS label,count(*)::int AS value
       FROM orders o LEFT JOIN jdatna.regions r ON r.id=o.region_id WHERE o.${window} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [days],
    ),
    q<Row>(
      `WITH ${ORDERS} SELECT COALESCE(top.name,'بلا قسم') AS label,count(DISTINCT o.id)::int AS value
       FROM orders o
       LEFT JOIN jdatna.product_categories pc ON pc.product_id=o.product_id
       LEFT JOIN jdatna.categories c ON c.id=pc.category_id
       LEFT JOIN jdatna.categories top ON top.id=COALESCE(c.parent_id,c.id)
       WHERE o.${window} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [days],
    ),
    q<Row>(
      `WITH ${ORDERS} SELECT meal AS label,count(*)::int AS value FROM orders WHERE ${window} GROUP BY 1 ORDER BY 2 DESC`,
      [days],
    ),
    q<Row>(
      `WITH ${ORDERS} SELECT extract(dow FROM created_at AT TIME ZONE 'Asia/Riyadh')::int AS label,count(*)::int AS value
       FROM orders WHERE ${window} GROUP BY 1 ORDER BY 1`,
      [days],
    ),
    q<Row>(
      `WITH ${ORDERS} SELECT (extract(hour FROM created_at AT TIME ZONE 'Asia/Riyadh')::int/3)*3 AS label,count(*)::int AS value
       FROM orders WHERE ${window} GROUP BY 1 ORDER BY 1`,
      [days],
    ),
  ]);
  const [topFamilies, topProducts, topViewed, topRated] = await Promise.all([
    q<Row>(
      `WITH ${ORDERS} SELECT COALESCE(p.trade_name,p.name) AS label,count(*)::int AS value,
         COALESCE(sum(o.value) FILTER (WHERE o.status NOT IN ('declined','cancelled')),0)::float8 AS amount
       FROM orders o JOIN jdatna.producer_profiles p ON p.id=o.producer_id WHERE o.${window}
       GROUP BY p.id,1 ORDER BY 2 DESC,3 DESC LIMIT 5`,
      [days],
    ),
    q<Row>(
      `WITH ${ORDERS} SELECT x.name AS label,count(*)::int AS value
       FROM orders o JOIN jdatna.products x ON x.id=o.product_id WHERE o.${window}
       GROUP BY x.id,1 ORDER BY 2 DESC LIMIT 5`,
      [days],
    ),
    q<Row>(
      `SELECT x.name AS label,v.views::int AS value FROM jdatna.view_counts v
       JOIN jdatna.products x ON x.id::text=v.target_id::text
       JOIN jdatna.producer_profiles p ON p.id=x.producer_id
       WHERE v.kind='product' AND x.deleted_at IS NULL AND NOT COALESCE(p.review_only,false)
       ORDER BY v.views DESC LIMIT 5`,
    ),
    q<Row>(
      `SELECT COALESCE(p.trade_name,p.name) AS label,round(avg(g.stars)::numeric,1)::float8 AS value,
         count(DISTINCT g.rater_id)::int AS raters
       FROM jdatna.ratings g JOIN jdatna.producer_profiles p ON p.id=g.target_id
       WHERE g.kind='family' AND p.status='approved' AND NOT COALESCE(p.review_only,false)
       GROUP BY p.id,1 HAVING count(DISTINCT g.rater_id)>=3 ORDER BY 2 DESC,3 DESC LIMIT 5`,
    ),
  ]);
  // فرص التسويق: ما يطلبه العملاء في «طلبات العملاء»، ومناطق فيها أعضاء أو طلبات ولا أسرة معتمدة.
  const [demandCategories, demandCities, gaps] = await Promise.all([
    q<Row>(
      `SELECT COALESCE(c.name,'بلا قسم') AS label,count(*)::int AS value FROM jdatna.customer_requests q
       LEFT JOIN jdatna.categories c ON c.id=q.category_id WHERE q.${window} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      [days],
    ),
    q<Row>(
      `SELECT COALESCE(c.name,'غير محدد') AS label,count(*)::int AS value FROM jdatna.customer_requests q
       LEFT JOIN jdatna.cities c ON c.id=q.city_id WHERE q.${window} GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
      [days],
    ),
    q<Row>(
      `SELECT r.name AS label,count(q.id)::int AS value FROM jdatna.regions r
       JOIN jdatna.cities c ON c.region_id=r.id
       JOIN jdatna.customer_requests q ON q.city_id=c.id
       WHERE NOT EXISTS (SELECT 1 FROM jdatna.producer_profiles p JOIN jdatna.cities pc ON pc.id=p.city_id
                         WHERE pc.region_id=r.id AND p.status='approved' AND NOT COALESCE(p.review_only,false))
       GROUP BY r.id,1 ORDER BY 2 DESC LIMIT 6`,
    ),
  ]);
  // التوقع: اتجاه آخر 8 أسابيع مكتملة (بلا الأسبوع الجاري الناقص) للأسابيع الأربعة القادمة.
  const done = weekly.slice(0, -1).slice(-8);
  const nextWeeks = (key: "orders" | "members") => {
    const series = done.map((w) => w[key]);
    let sum = 0;
    for (let i = 1; i <= 4; i++) sum += linearNext(series, i);
    return Math.round(sum);
  };
  const avgValue =
    current.orders && current.lost !== null
      ? Number(current.value) /
        Math.max(1, Number(current.orders) - Number(current.lost))
      : 0;
  return {
    days,
    generatedAt: new Date().toISOString(),
    current,
    previous,
    totals,
    repeatRate: repeat ?? null,
    averageValue: Math.round(avgValue),
    weekly,
    breakdowns: { regions, categories, meals, weekdays, hours },
    top: {
      families: topFamilies,
      products: topProducts,
      viewed: topViewed,
      rated: topRated,
    },
    demand: { categories: demandCategories, cities: demandCities, gaps },
    forecast: {
      basis: done.length,
      orders: nextWeeks("orders"),
      members: nextWeeks("members"),
      value: Math.round(nextWeeks("orders") * avgValue),
    },
  };
}
export type AdminInsights = Awaited<ReturnType<typeof adminInsights>>;
