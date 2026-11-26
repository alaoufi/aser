-- قرار المالك 2026-11-26: العميل يتحول إلى أسرة والعكس، من «معلوماتي» ومن الإدارة. تحوّل الأسرة إلى
-- عميل يغلق ملفها ('closed'): صفحتها ومنتجاتها مخفية ومحفوظة، وتعود بحالتها السابقة (closed_from) عند العودة.
BEGIN;
ALTER TABLE jdatna.producer_profiles DROP CONSTRAINT IF EXISTS producer_profiles_status_check;
ALTER TABLE jdatna.producer_profiles ADD CONSTRAINT producer_profiles_status_check
  CHECK (status IN ('pending','approved','rejected','suspended','closed'));
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS closed_from text
  CHECK (closed_from IS NULL OR closed_from IN ('pending','approved','rejected'));
COMMIT;
