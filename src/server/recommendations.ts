import type { Product, SessionUser } from "../lib/types";
import { databaseConfigured, db } from "./db";
import { mapProduct, productSelect } from "./catalog";

/**
 * الاقتراحات الذكية بلا أي خدمة خارجية: كل الحساب داخل قاعدة البيانات من نشاط العضو نفسه.
 *
 * للعميل («مقترح لك»): أطباق متاحة في نطاقه، مرتبة بما يناسب ذوقه:
 *   - أقسام ما طلبه (×3)، وما قيّمه 4 نجوم فأكثر (×2)، وما فتحه آخر 60 يومًا (×1).
 *   - أسر طلب منها أو قيّمها أو راسلها.
 *   - ثم الأكثر طلبًا في منطقته آخر 30 يومًا، والمتوفر الآن قبل حسب الطلب.
 *   لكل اقتراح سبب يُعرض له («لأنك تحب الجريش»…). بلا نشاط سابق: الأكثر طلبًا ثم الأحدث.
 *
 * للأسرة («طلب منطقتك»): أرقام مجمّعة لا تكشف أي عميل أو طلب بعينه (لا يظهر رقم أقل من 3):
 *   الأقسام الأكثر طلبًا في منطقتها، وأقسام عليها طلب وقليل من يقدّمها (فرص)،
 *   وأقسام يطلبها عملاؤها من أسر أخرى.
 */
export type Suggestion = { product: Product; reason: string };

const REACH = `(
  $2::text = ''
  OR x.delivery_scope = 'kingdom'
  OR EXISTS (SELECT 1 FROM jdatna.cities rc WHERE rc.id = p.city_id AND rc.region_id = $2)
)`;

export async function memberSuggestions(
  user: SessionUser | null,
  region: string,
  limit = 8,
): Promise<{ items: Suggestion[]; personal: boolean }> {
  if (!databaseConfigured()) return { items: [], personal: false };
  const uid = user?.id ?? null;
  const rows = (
    await db().query<{
      id: string;
      category: string | null;
      family: boolean;
      popular: number;
      personal: boolean;
    }>(
      `WITH ordered AS (
         SELECT product_id, producer_id FROM jdatna.order_requests
         WHERE $1::uuid IS NOT NULL AND user_id = $1 AND created_at > now() - interval '180 days'
       ),
       taste AS (
         SELECT category_id, sum(w)::float8 AS w FROM (
           SELECT pc.category_id, 3 AS w FROM ordered o JOIN jdatna.product_categories pc ON pc.product_id = o.product_id
           UNION ALL
           SELECT pc.category_id, 2 FROM jdatna.ratings r JOIN jdatna.product_categories pc ON pc.product_id = r.target_id
             WHERE $1::uuid IS NOT NULL AND r.rater_id = $1 AND r.kind = 'product' AND r.stars >= 4
           UNION ALL
           SELECT pc.category_id, 1 FROM jdatna.member_product_views v JOIN jdatna.product_categories pc ON pc.product_id = v.product_id
             WHERE $1::uuid IS NOT NULL AND v.user_id = $1 AND v.last_at > now() - interval '60 days'
         ) t GROUP BY category_id
       ),
       liked AS (
         SELECT producer_id, sum(w)::float8 AS w FROM (
           SELECT producer_id, 2 AS w FROM ordered
           UNION ALL
           SELECT target_id, 1 FROM jdatna.ratings
             WHERE $1::uuid IS NOT NULL AND rater_id = $1 AND kind = 'family' AND stars >= 4
           UNION ALL
           SELECT producer_id, 1 FROM jdatna.conversations
             WHERE $1::uuid IS NOT NULL AND customer_id = $1 AND producer_id IS NOT NULL
         ) t GROUP BY producer_id
       ),
       popular AS (
         SELECT product_id, count(*)::float8 AS n FROM jdatna.order_requests
         WHERE created_at > now() - interval '30 days' GROUP BY product_id
       ),
       scored AS (
         SELECT x.id,
           (SELECT t.category_id FROM jdatna.product_categories pc JOIN taste t ON t.category_id = pc.category_id
              WHERE pc.product_id = x.id ORDER BY t.w DESC LIMIT 1) AS category,
           COALESCE((SELECT sum(t.w) FROM jdatna.product_categories pc JOIN taste t ON t.category_id = pc.category_id
              WHERE pc.product_id = x.id), 0) AS taste,
           COALESCE((SELECT l.w FROM liked l WHERE l.producer_id = x.producer_id), 0) AS family,
           COALESCE((SELECT n FROM popular WHERE product_id = x.id), 0) AS popular,
           x.status, x.created_at
         FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id = x.producer_id
         WHERE x.visible AND x.deleted_at IS NULL AND x.status <> 'unavailable'
           AND p.status = 'approved' AND NOT p.review_only
           AND ($1::uuid IS NULL OR p.user_id <> $1)
           AND ${REACH}
           -- ما طلبه آخر 3 أيام لا يُقترح عليه من جديد.
           AND NOT EXISTS (SELECT 1 FROM jdatna.order_requests o
             WHERE $1::uuid IS NOT NULL AND o.user_id = $1 AND o.product_id = x.id AND o.created_at > now() - interval '3 days')
       )
       SELECT s.id, c.name AS category, s.family > 0 AS family, s.popular,
         (s.taste > 0 OR s.family > 0) AS personal
       FROM scored s LEFT JOIN jdatna.categories c ON c.id = s.category
       ORDER BY s.taste + s.family * 1.5 + ln(1 + s.popular) * 0.5 + (s.status = 'available')::int * 0.5 DESC,
         s.created_at DESC
       LIMIT $3`,
      [uid, region, limit],
    )
  ).rows;
  if (!rows.length) return { items: [], personal: false };
  const products = new Map(
    (
      await db().query<Product>(
        `${productSelect} WHERE x.id = ANY($1::uuid[])`,
        [rows.map((r) => r.id)],
      )
    ).rows.map((p) => [p.id, mapProduct(p)]),
  );
  const items: Suggestion[] = [];
  for (const r of rows) {
    const product = products.get(r.id);
    if (!product) continue;
    const reason = r.family
      ? "من أسرة تعاملت معها"
      : r.category
        ? `لأنك تحب ${r.category}`
        : r.popular > 0
          ? "الأكثر طلبًا قريبًا منك"
          : "جديد قريب منك";
    items.push({ product, reason });
  }
  return { items, personal: rows.some((r) => r.personal) };
}

export type FamilyInsights = {
  regionName: string | null;
  /** الأقسام الأكثر طلبًا في منطقة الأسرة آخر 30 يومًا. */
  popular: { category: string; orders: number }[];
  /** أقسام عليها طلب في المنطقة وقليل من الأسر يقدّمها، والأسرة لا تقدّمها بعد. */
  opportunities: { category: string; orders: number; families: number }[];
  /** أقسام يطلبها عملاء هذه الأسرة من أسر أخرى. */
  alsoBought: { category: string; customers: number }[];
};

/** أقل عدد يُعرض في «طلب منطقتك»: لا يُستدل منه على عميل أو طلب بعينه. */
const MIN_COUNT = 3;

export async function familyInsights(
  user: SessionUser,
): Promise<FamilyInsights | null> {
  if (!databaseConfigured()) return null;
  const family = (
    await db().query<{
      id: string;
      region: string | null;
      regionName: string | null;
    }>(
      `SELECT p.id, c.region_id AS region, r.name AS "regionName"
       FROM jdatna.producer_profiles p
       LEFT JOIN jdatna.cities c ON c.id = p.city_id
       LEFT JOIN jdatna.regions r ON r.id = c.region_id
       WHERE p.user_id = $1`,
      [user.id],
    )
  ).rows[0];
  if (!family) return null;
  const [popular, opportunities, alsoBought] = await Promise.all([
    db().query<{ category: string; orders: number }>(
      `SELECT c.name AS category, count(DISTINCT o.id)::int AS orders
       FROM jdatna.order_requests o
       JOIN jdatna.producer_profiles p ON p.id = o.producer_id
       JOIN jdatna.cities ct ON ct.id = p.city_id
       JOIN jdatna.product_categories pc ON pc.product_id = o.product_id
       JOIN jdatna.categories c ON c.id = pc.category_id AND NOT c.hidden
       WHERE o.created_at > now() - interval '30 days' AND ct.region_id = $1
       GROUP BY c.name HAVING count(DISTINCT o.id) >= ${MIN_COUNT}
       ORDER BY orders DESC LIMIT 5`,
      [family.region],
    ),
    db().query<{ category: string; orders: number; families: number }>(
      `WITH demand AS (
         SELECT pc.category_id, count(DISTINCT o.id)::int AS orders
         FROM jdatna.order_requests o
         JOIN jdatna.producer_profiles p ON p.id = o.producer_id
         JOIN jdatna.cities ct ON ct.id = p.city_id
         JOIN jdatna.product_categories pc ON pc.product_id = o.product_id
         WHERE o.created_at > now() - interval '30 days' AND ct.region_id = $1
         GROUP BY pc.category_id HAVING count(DISTINCT o.id) >= ${MIN_COUNT}
       ),
       supply AS (
         SELECT pc.category_id, count(DISTINCT x.producer_id)::int AS families
         FROM jdatna.products x
         JOIN jdatna.producer_profiles p ON p.id = x.producer_id AND p.status = 'approved' AND NOT p.review_only
         JOIN jdatna.cities ct ON ct.id = p.city_id AND ct.region_id = $1
         JOIN jdatna.product_categories pc ON pc.product_id = x.id
         WHERE x.visible AND x.deleted_at IS NULL
         GROUP BY pc.category_id
       )
       SELECT c.name AS category, d.orders, COALESCE(s.families, 0) AS families
       FROM demand d JOIN jdatna.categories c ON c.id = d.category_id AND NOT c.hidden
       LEFT JOIN supply s ON s.category_id = d.category_id
       WHERE NOT EXISTS (
         SELECT 1 FROM jdatna.products x JOIN jdatna.product_categories pc ON pc.product_id = x.id
         WHERE x.producer_id = $2 AND x.deleted_at IS NULL AND pc.category_id = d.category_id)
       ORDER BY d.orders::float8 / (1 + COALESCE(s.families, 0)) DESC LIMIT 3`,
      [family.region, family.id],
    ),
    db().query<{ category: string; customers: number }>(
      `WITH mine AS (
         SELECT DISTINCT user_id FROM jdatna.order_requests
         WHERE producer_id = $1 AND user_id IS NOT NULL AND created_at > now() - interval '180 days'
       )
       SELECT c.name AS category, count(DISTINCT o.user_id)::int AS customers
       FROM jdatna.order_requests o
       JOIN mine m ON m.user_id = o.user_id
       JOIN jdatna.product_categories pc ON pc.product_id = o.product_id
       JOIN jdatna.categories c ON c.id = pc.category_id AND NOT c.hidden
       WHERE o.producer_id <> $1 AND o.created_at > now() - interval '180 days'
       GROUP BY c.name HAVING count(DISTINCT o.user_id) >= ${MIN_COUNT}
       ORDER BY customers DESC LIMIT 3`,
      [family.id],
    ),
  ]);
  return {
    regionName: family.regionName,
    popular: popular.rows,
    opportunities: opportunities.rows,
    alsoBought: alsoBought.rows,
  };
}
