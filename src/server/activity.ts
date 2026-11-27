import { databaseConfigured, db } from "./db";

/**
 * أرقام الحركة (قرار المالك 2026-11-26): أرقام فقط، بلا أسماء عملاء ولا أسعار.
 * «عملية» = طلب قبلته الأسرة أو أكملته. لا يُحسب المرفوض ولا الملغى ولا المنتظر،
 * ولا طلب حساب مراجعة المتجر.
 */
export const countedOrderSql = (alias = "o") =>
  `${alias}.status IN ('accepted','completed') AND ${alias}.request_hash<>'store-review'`;

export type ActivityTotals = {
  orders: number;
  families: number;
  products: number;
};

let cached: { at: number; value: ActivityTotals } | null = null;

/**
 * مربع الإحصائيات أسفل كل صفحة (قرار المالك 2026-11-27): الأسر المنتجة المعتمدة، والمنتجات المعروضة،
 * والطلبات المنفّذة. أرقام فقط. يُحفظ دقيقة في الذاكرة لأنه يُطلب مع كل صفحة.
 */
export async function activityTotals(): Promise<ActivityTotals> {
  const none = { orders: 0, families: 0, products: 0 };
  // بلا قاعدة (فحص السرعة) أو عند خطأ: لا يظهر المربع، ولا تتعطل الصفحة.
  if (!databaseConfigured()) return none;
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  try {
    const row = (
      await db().query<ActivityTotals>(
        `SELECT
           (SELECT count(*)::int FROM jdatna.producer_profiles p
             WHERE p.status='approved' AND NOT p.review_only) AS families,
           (SELECT count(*)::int FROM jdatna.products x
              JOIN jdatna.producer_profiles p ON p.id=x.producer_id
             WHERE p.status='approved' AND NOT p.review_only AND x.visible AND x.deleted_at IS NULL) AS products,
           (SELECT count(*)::int FROM jdatna.order_requests o
              JOIN jdatna.producer_profiles p ON p.id=o.producer_id AND p.status='approved' AND NOT p.review_only
             WHERE ${countedOrderSql()}) AS orders`,
      )
    ).rows[0];
    const value = row ?? none;
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return none;
  }
}

/** للاختبارات: يُحسب من جديد. */
export function resetActivityCache() {
  cached = null;
}
