-- موقع الأسرة معلن في صفحتها العامة أو لا، بحسب رغبة الأسرة (افتراضي: غير معلن).
BEGIN;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS show_location boolean NOT NULL DEFAULT false;
COMMIT;
