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

/** مجموع الحركة في الموقع كله، للأسر والمنتجات الظاهرة للعملاء فقط. */
export async function activityTotals(): Promise<ActivityTotals> {
  const none = { orders: 0, families: 0, products: 0 };
  // بلا قاعدة (فحص السرعة) أو عند خطأ: لا يظهر الشريط، ولا تتعطل الرئيسية.
  if (!databaseConfigured()) return none;
  try {
    const row = (
      await db().query<ActivityTotals>(
        `SELECT count(*)::int AS orders,
              count(DISTINCT o.producer_id)::int AS families,
              count(DISTINCT o.product_id)::int AS products
         FROM jdatna.order_requests o
         JOIN jdatna.producer_profiles p ON p.id=o.producer_id AND p.status='approved' AND NOT p.review_only
        WHERE ${countedOrderSql()}`,
      )
    ).rows[0];
    return row ?? none;
  } catch {
    return none;
  }
}
