-- «تنبيهات الأسرة» (طلب المالك 2026-11-26): العضو يتابع أسرة فيصله تنبيه بمنتجها الجديد أو ببداية توزيع
-- منتج مجدول. جداول جديدة فقط؛ لا تغيير في الجداول القائمة، فالإصدار السابق يعمل معها كما هو.
BEGIN;
-- جدول توزيع المنتج: يومي، أو أسبوعي بأيام محددة (0 الأحد … 6 السبت)، أو تاريخ محدد.
CREATE TABLE IF NOT EXISTS jdatna.product_schedules (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES jdatna.products(id) ON DELETE CASCADE,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily','weekly','date')),
  weekdays smallint[] NOT NULL DEFAULT '{}'
    CHECK (weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  starts_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- متى أُعلن بدؤه للمتابعين (مرة واحدة لكل جدول).
  announced_at timestamptz,
  CHECK (kind <> 'weekly' OR cardinality(weekdays) > 0)
);
CREATE INDEX IF NOT EXISTS product_schedules_due ON jdatna.product_schedules(starts_on) WHERE announced_at IS NULL;
CREATE INDEX IF NOT EXISTS product_schedules_product ON jdatna.product_schedules(product_id);

-- متابعة العضو لأسرة، بموافقته الصريحة ورمز إلغاء خاص بها.
CREATE TABLE IF NOT EXISTS jdatna.family_follows (
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  notify_new boolean NOT NULL DEFAULT true,
  notify_schedule boolean NOT NULL DEFAULT true,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','selected')),
  paused boolean NOT NULL DEFAULT false,
  consented_at timestamptz NOT NULL,
  unsubscribe_token text NOT NULL UNIQUE CHECK (unsubscribe_token ~ '^[a-f0-9]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, producer_id),
  CHECK (notify_new OR notify_schedule)
);
CREATE INDEX IF NOT EXISTS family_follows_producer ON jdatna.family_follows(producer_id);
CREATE TABLE IF NOT EXISTS jdatna.family_follow_products (
  user_id uuid NOT NULL,
  producer_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES jdatna.products(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, producer_id, product_id),
  FOREIGN KEY (user_id, producer_id) REFERENCES jdatna.family_follows(user_id, producer_id) ON DELETE CASCADE
);

-- أحداث تنتظر الإرسال (تُجمع الدفعة الكبيرة في تنبيه واحد بعد مهلة قصيرة).
CREATE TABLE IF NOT EXISTS jdatna.family_alert_events (
  id bigserial PRIMARY KEY,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES jdatna.products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new','schedule')),
  ref text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS family_alert_events_pending ON jdatna.family_alert_events(created_at) WHERE processed_at IS NULL;

-- منع التكرار: تنبيه واحد للعضو عن المنتج نفسه والحدث نفسه.
CREATE TABLE IF NOT EXISTS jdatna.family_alerts_sent (
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES jdatna.products(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  suppressed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, product_id, kind, ref)
);

-- صندوق التنبيهات داخل الموقع («تنبيهاتي»)، ومنه يُحسب الحد اليومي.
CREATE TABLE IF NOT EXISTS jdatna.member_alerts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE CASCADE,
  producer_id uuid REFERENCES jdatna.producer_profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_alerts_recent ON jdatna.member_alerts(user_id, created_at DESC);
COMMIT;
