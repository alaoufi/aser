-- «المظهر» (طلب المالك 2026-11-26): قالب ثالث «المبسّط»، ومظهر العضو المسجّل محفوظ في حسابه.
-- متوافق مع الإصدار السابق: لا يكتب «simple» ولا يقرأ الجدول الجديد، ويعود للكلاسيكي إن قرأ قالبًا لا يعرفه.
BEGIN;
ALTER TABLE jdatna.site_settings DROP CONSTRAINT IF EXISTS site_template_value;
ALTER TABLE jdatna.site_settings ADD CONSTRAINT site_template_value
  CHECK (key <> 'template' OR value IN ('najdi','classic','simple'));
CREATE TABLE IF NOT EXISTS jdatna.member_appearance (
  user_id uuid PRIMARY KEY REFERENCES jdatna.users(id) ON DELETE CASCADE,
  template text CHECK (template IS NULL OR template ~ '^[a-z]{1,20}$'),
  palette text CHECK (palette IS NULL OR palette ~ '^[a-z]{1,20}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
