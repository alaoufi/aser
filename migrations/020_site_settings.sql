-- إعدادات الموقع العامة: قالب الواجهة (الباب النجدي أو الكلاسيكي). جدول جديد فقط.
BEGIN;
CREATE TABLE IF NOT EXISTS jdatna.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES jdatna.users(id)
);
ALTER TABLE jdatna.site_settings DROP CONSTRAINT IF EXISTS site_template_value;
ALTER TABLE jdatna.site_settings ADD CONSTRAINT site_template_value
  CHECK (key <> 'template' OR value IN ('najdi','classic'));
INSERT INTO jdatna.site_settings(key,value) VALUES('template','najdi')
  ON CONFLICT (key) DO NOTHING;
COMMIT;
