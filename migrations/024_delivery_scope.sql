-- نطاق التوصيل: داخل نطاق التغطية، أو جميع مناطق المملكة بالشحن (يضاف على السعر).
-- للأسرة قيمة افتراضية عند التسجيل، ولكل منتج قيمته القابلة للتعديل. أعمدة جديدة بقيم افتراضية آمنة.
BEGIN;
ALTER TABLE jdatna.producer_profiles
  ADD COLUMN IF NOT EXISTS delivery_scope text NOT NULL DEFAULT 'coverage',
  ADD COLUMN IF NOT EXISTS shipping_fee numeric(10,2);
ALTER TABLE jdatna.producer_profiles DROP CONSTRAINT IF EXISTS producer_delivery_scope;
ALTER TABLE jdatna.producer_profiles ADD CONSTRAINT producer_delivery_scope CHECK (
  delivery_scope IN ('coverage','kingdom') AND (shipping_fee IS NULL OR shipping_fee BETWEEN 0 AND 99999999.99)
);
ALTER TABLE jdatna.products
  ADD COLUMN IF NOT EXISTS delivery_scope text NOT NULL DEFAULT 'coverage',
  ADD COLUMN IF NOT EXISTS shipping_fee numeric(10,2);
ALTER TABLE jdatna.products DROP CONSTRAINT IF EXISTS product_delivery_scope;
ALTER TABLE jdatna.products ADD CONSTRAINT product_delivery_scope CHECK (
  delivery_scope IN ('coverage','kingdom') AND (shipping_fee IS NULL OR shipping_fee BETWEEN 0 AND 99999999.99)
);
COMMIT;
