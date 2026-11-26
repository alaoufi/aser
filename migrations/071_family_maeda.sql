-- «صانع المائدة» (اعتماد المالك 2026-11-26): مائدة كل أسرة في صفحتها (الشكل والخامة واللون والحافة والمفرش).
-- متوافق مع الإصدار السابق: عمود اختياري لا يقرؤه، وNULL = مائدة السدو الأصلية.
-- الخيارات التي تخفيها الإدارة في site_settings (المفتاح maeda:hidden)، بلا جدول جديد.
BEGIN;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS maeda jsonb;
ALTER TABLE jdatna.producer_profiles DROP CONSTRAINT IF EXISTS producer_maeda_shape;
ALTER TABLE jdatna.producer_profiles ADD CONSTRAINT producer_maeda_shape
  CHECK (maeda IS NULL OR (jsonb_typeof(maeda) = 'object' AND length(maeda::text) <= 400));
COMMIT;
