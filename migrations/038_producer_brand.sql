-- مكتبة الهويات:
-- هوية الأسرة (لون + زخرفة + تأثير + حجم) تظهر في خلفية بطاقتها وشكلها وتأخذها كل منتجاتها.
-- هوية القسم (إطار/برواز) تظهر في حدود بطاقات منتجاته.
-- جداول مستقلة؛ المستوى المدفوع (tier='pro') والإعدادات الخاصة (custom) جاهزة للمستقبل.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.producer_brand (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  palette text NOT NULL CHECK (palette ~ '^[a-z0-9-]{2,40}$'),
  pattern text NOT NULL DEFAULT 'plain' CHECK (pattern ~ '^[a-z0-9-]{2,40}$'),
  effect text NOT NULL DEFAULT 'soft' CHECK (effect ~ '^[a-z]{2,20}$'),
  scale smallint NOT NULL DEFAULT 2 CHECK (scale BETWEEN 1 AND 3),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro')),
  custom jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jdatna.category_identity (
  category_id text PRIMARY KEY REFERENCES jdatna.categories(id) ON DELETE CASCADE,
  frame text NOT NULL CHECK (frame ~ '^[a-z0-9-]{2,40}$'),
  updated_by uuid REFERENCES jdatna.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
