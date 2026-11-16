-- الحماية أولًا (قرار المالك 2026-11-17):
-- 1) قفل الحساب بعد 5 محاولات دخول خاطئة متتالية؛ لا يُفتح إلا باستعادة كلمة المرور برمز الجوال.
-- 2) جلسة المدير والمشرف 12 ساعة: الجلسات القائمة لهم تُختصر إلى 12 ساعة من الآن.
-- 3) نوعا حدث جديدان في سجل الأمان: قفل حساب، ودخول إلى حساب مقفل.
BEGIN;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS failed_logins integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0);
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS login_locked_at timestamptz;
UPDATE jdatna.sessions s SET expires_at=LEAST(s.expires_at, now()+interval '12 hours')
  FROM jdatna.users u WHERE u.id=s.user_id AND (u.role='admin' OR cardinality(u.permissions)>0);
ALTER TABLE jdatna.security_events DROP CONSTRAINT IF EXISTS security_events_kind_check;
ALTER TABLE jdatna.security_events ADD CONSTRAINT security_events_kind_check CHECK (kind IN
  ('login.failed','login.admin','otp.failed','rate_limited','access.denied','origin.rejected','login.locked','login.while_locked'));
COMMIT;
