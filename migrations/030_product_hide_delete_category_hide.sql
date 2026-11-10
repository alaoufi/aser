-- الأسرة تخفي منتجها أو تحذفه (أرشفة تحفظ سجل الطلبات)، والإدارة تخفي القسم.
-- أعمدة جديدة فقط؛ المخفي سابقًا يُنسب للإدارة.
BEGIN;
ALTER TABLE jdatna.products ADD COLUMN IF NOT EXISTS hidden_by text;
ALTER TABLE jdatna.products DROP CONSTRAINT IF EXISTS products_hidden_by_check;
ALTER TABLE jdatna.products ADD CONSTRAINT products_hidden_by_check CHECK (hidden_by IS NULL OR hidden_by IN ('admin','family'));
ALTER TABLE jdatna.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
UPDATE jdatna.products SET hidden_by='admin' WHERE visible=false AND hidden_by IS NULL;
ALTER TABLE jdatna.categories ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
COMMIT;
