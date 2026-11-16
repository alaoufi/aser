-- سجل الأمان: محاولات الدخول الفاشلة، ورموز التحقق الخاطئة، وتجاوز حدود المحاولات،
-- والرفض في مسارات الإدارة، ودخول حسابات الإدارة. عنوان الزائر يُحفظ مموّهًا (HMAC) لا نصًّا،
-- ويكفي لتجميع المحاولات من مصدر واحد. يُحذف ما مضى عليه 90 يومًا.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.security_events (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('login.failed','login.admin','otp.failed','rate_limited','access.denied','origin.rejected')),
  user_id uuid REFERENCES jdatna.users(id) ON DELETE SET NULL,
  source text CHECK (source ~ '^[a-f0-9]{16}$'),
  subject text CHECK (subject ~ '^[a-f0-9]{16}$'),
  detail text CHECK (length(detail) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_time ON jdatna.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_kind_time ON jdatna.security_events(kind, created_at DESC);
COMMIT;
