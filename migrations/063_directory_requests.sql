-- «دليلي» و«طلبات العملاء» (قرار المالك 2026-11-22). جداول جديدة فقط؛ لا تغيير في الطلبات ولا الحسابات.
--
-- «دليلي»: دفتر جهات خاص بصاحبه وحده. العميل يحفظ الأسر والمندوبين، والأسرة تحفظ عملاءها
-- ومندوبيها، ولكلٍّ إضافة جهة يدويًا (اسم وجوال وواتساب) أو من جهات جواله. بيانات التواصل
-- لأسرة أو مندوب محفوظ تُقرأ من ملفه وقت العرض بحسب ما يسمح بإظهاره، ولا تُنسخ هنا.
--
-- «طلبات العملاء»: العميل ينشر ما يريد، وتراه الأسر المعتمدة. اسمه وجواله وواتسابه لا تظهر
-- إلا بموافقته على كل واحد منها، والمراسلة من الموقع متاحة دائمًا.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.directory_entries (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('family','courier','customer','contact')),
  producer_id uuid REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES jdatna.courier_profiles(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES jdatna.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{6,15}$'),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^\+?[0-9]{6,15}$'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'family') = (producer_id IS NOT NULL)
    AND (kind = 'courier') = (courier_id IS NOT NULL)
    AND (kind = 'customer') = (customer_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS directory_family ON jdatna.directory_entries(owner_id, producer_id) WHERE producer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS directory_courier ON jdatna.directory_entries(owner_id, courier_id) WHERE courier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS directory_customer ON jdatna.directory_entries(owner_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS directory_owner ON jdatna.directory_entries(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jdatna.customer_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 500),
  category_id text REFERENCES jdatna.categories(id) ON DELETE SET NULL,
  city_id text NOT NULL REFERENCES jdatna.cities(id),
  people integer CHECK (people IS NULL OR people BETWEEN 1 AND 1000),
  needed_on date,
  show_name boolean NOT NULL DEFAULT false,
  show_phone boolean NOT NULL DEFAULT false,
  show_whatsapp boolean NOT NULL DEFAULT false,
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^\+?[0-9]{6,15}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  CHECK (NOT show_whatsapp OR whatsapp IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS customer_requests_open ON jdatna.customer_requests(city_id, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS customer_requests_user ON jdatna.customer_requests(user_id, created_at DESC);
COMMIT;
