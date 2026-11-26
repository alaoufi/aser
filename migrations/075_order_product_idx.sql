-- أرقام الحركة (قرار المالك 2026-11-26): عدد طلبات كل منتج يُقرأ في بطاقته، ففهرس على المنتج.
CREATE INDEX IF NOT EXISTS order_requests_product_idx
  ON jdatna.order_requests(product_id) WHERE status IN ('accepted','completed');
