-- ظهور بيانات التواصل للعملاء: الأسرة تختار إظهار الجوال وواتساب أو إخفاءهما.
-- الافتراضي يبقي ما كان ظاهرًا: الجوال ظاهر، وواتساب ظاهر لمن سجّل رقمه فقط.
BEGIN;
ALTER TABLE jdatna.producer_profiles
  ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_whatsapp boolean;
UPDATE jdatna.producer_profiles SET show_whatsapp = (coalesce(whatsapp, '') <> '') WHERE show_whatsapp IS NULL;
ALTER TABLE jdatna.producer_profiles
  ALTER COLUMN show_whatsapp SET DEFAULT true,
  ALTER COLUMN show_whatsapp SET NOT NULL;
COMMIT;
