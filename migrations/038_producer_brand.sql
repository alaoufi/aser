-- هوية الأسرة: لون تختاره يميّز بطاقتها وبطاقات منتجاتها.
-- جدول مستقل جاهز للهويات الاحترافية المدفوعة مستقبلًا (tier='pro' مع custom).
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.producer_brand (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  palette text NOT NULL CHECK (palette ~ '^[a-z]{2,20}$'),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro')),
  custom jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
