-- قرار المالك 2026-11-26: بعد انتهاء مهلة المستندات تختار الإدارة «تمديد» أو «إخفاء المنتجات حتى رفع
-- المستندات». المنتجات الظاهرة وقتها تُخفى بعلامة 'docs'، وتعود كما كانت عند رفع المستند أو التمديد.
BEGIN;
ALTER TABLE jdatna.products DROP CONSTRAINT IF EXISTS products_hidden_by_check;
ALTER TABLE jdatna.products ADD CONSTRAINT products_hidden_by_check
  CHECK (hidden_by IS NULL OR hidden_by IN ('admin','family','docs'));
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS docs_hidden_at timestamptz;
COMMIT;
