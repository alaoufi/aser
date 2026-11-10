-- مناطق توصيل الأسرة المنتجة مرسومة على الخريطة: جدول جديد فقط.
-- النقاط [خط العرض، خط الطول]؛ لا يُخزَّن موقع العميل عند الفحص.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.producer_zones (
  id uuid PRIMARY KEY,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 99),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  fee numeric(10,2) CHECK (fee BETWEEN 0 AND 99999999.99),
  points jsonb NOT NULL CHECK (
    jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 3 AND 200
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS producer_zones_producer ON jdatna.producer_zones(producer_id);
COMMIT;
