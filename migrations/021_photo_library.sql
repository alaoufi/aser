-- مكتبة صور الأسرة المنتجة: جدول جديد، وإعادة القالب الافتراضي إلى الكلاسيكي بطلب المالك.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.photo_library (
  id uuid PRIMARY KEY,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category_id text REFERENCES jdatna.categories(id),
  object_key text UNIQUE NOT NULL,
  mime text NOT NULL DEFAULT 'image/webp',
  size integer NOT NULL CHECK (size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_library_producer ON jdatna.photo_library(producer_id, created_at DESC);
UPDATE jdatna.site_settings SET value='classic', updated_at=now() WHERE key='template';
COMMIT;
