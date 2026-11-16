-- الاشتراكات: الأسرة تتيح اشتراكًا يوميًا أو أسبوعيًا أو شهريًا أو لمدة محددة، بوجبات تختارها ومع التوصيل،
-- والعميل يطلب اشتراكًا (النوع، تاريخ البدء، عدد الأيام للمدة المحددة، الوجبات، التوصيل)
-- فيُحوَّل إلى المحادثة مع الأسرة للاتفاق. جداول جديدة فقط؛ جدول الطلبات لا يتغير.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.producer_subscription_plans (
  producer_id uuid PRIMARY KEY REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  daily boolean NOT NULL DEFAULT false,
  weekly boolean NOT NULL DEFAULT false,
  monthly boolean NOT NULL DEFAULT false,
  period boolean NOT NULL DEFAULT false,
  meals text[] NOT NULL DEFAULT '{}' CHECK (meals <@ ARRAY['breakfast','lunch','dinner']::text[]),
  delivery boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jdatna.subscription_requests (
  id uuid PRIMARY KEY,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES jdatna.users(id),
  plan text NOT NULL CHECK (plan IN ('daily','weekly','monthly','period')),
  start_date date NOT NULL,
  days integer CHECK (days IS NULL OR days BETWEEN 1 AND 365),
  meals text[] NOT NULL CHECK (cardinality(meals) BETWEEN 1 AND 3 AND meals <@ ARRAY['breakfast','lunch','dinner']::text[]),
  delivery boolean NOT NULL DEFAULT false,
  location text CHECK (location IS NULL OR length(location) <= 1000),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  conversation_id uuid REFERENCES jdatna.conversations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','agreed','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((plan = 'period') = (days IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS subscription_requests_producer ON jdatna.subscription_requests(producer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_requests_user ON jdatna.subscription_requests(user_id, created_at DESC);
COMMIT;
