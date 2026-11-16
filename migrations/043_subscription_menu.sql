-- قائمة أطباق الاشتراك: الأسرة تُدخل أطباق كل وجبة (فطور، غداء، عشاء)،
-- وبعد الاتفاق يختار العميل طبقًا دائمًا لكل وجبة، ويغيّر طبق يوم معيّن قبله بيوم على الأقل.
-- جداول جديدة فقط؛ جدول الطلبات لا يتغير.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.subscription_menu_items (
  id uuid PRIMARY KEY,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  meal text NOT NULL CHECK (meal IN ('breakfast','lunch','dinner')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_menu_items_family ON jdatna.subscription_menu_items(producer_id, meal) WHERE active;
-- الطبق الدائم لكل وجبة في الاشتراك.
CREATE TABLE IF NOT EXISTS jdatna.subscription_choices (
  subscription_id uuid NOT NULL REFERENCES jdatna.subscription_requests(id) ON DELETE CASCADE,
  meal text NOT NULL CHECK (meal IN ('breakfast','lunch','dinner')),
  item_id uuid NOT NULL REFERENCES jdatna.subscription_menu_items(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, meal)
);
-- طبق مختلف ليوم معيّن (يُحدَّد قبل اليوم بيوم على الأقل).
CREATE TABLE IF NOT EXISTS jdatna.subscription_day_choices (
  subscription_id uuid NOT NULL REFERENCES jdatna.subscription_requests(id) ON DELETE CASCADE,
  day date NOT NULL,
  meal text NOT NULL CHECK (meal IN ('breakfast','lunch','dinner')),
  item_id uuid NOT NULL REFERENCES jdatna.subscription_menu_items(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, day, meal)
);
COMMIT;
