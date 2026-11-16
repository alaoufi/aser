-- الرابط المختصر للمشاركة (واتساب وتيك توك وغيرها): jdatna.com/s/رمز يحوّل إلى صفحة المنتج أو الأسرة.
-- جدول جديد فقط؛ رمز ثابت لكل منتج أو أسرة يُنشأ عند أول مشاركة.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.share_links (
  code text PRIMARY KEY CHECK (code ~ '^[2-9a-zA-Z]{6,12}$'),
  kind text NOT NULL CHECK (kind IN ('product','family')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, target_id)
);
COMMIT;
