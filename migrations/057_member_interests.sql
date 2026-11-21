-- الاقتراحات الذكية (مقترح لك): المنتجات التي فتحها العضو المسجّل، لتُستنتج الأقسام التي تهمه.
-- جدول جديد فقط. يُحذف مع حساب العضو (ON DELETE CASCADE)، ويُنسى ما مضى عليه 90 يومًا.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.member_product_views (
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES jdatna.products(id) ON DELETE CASCADE,
  views integer NOT NULL DEFAULT 1 CHECK (views >= 1),
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS member_product_views_recent ON jdatna.member_product_views(user_id, last_at DESC);
CREATE INDEX IF NOT EXISTS order_requests_recent ON jdatna.order_requests(created_at DESC);
COMMIT;
