-- قائمة الأسر في الإدارة (قرار المالك 2026-11-28):
-- «إخفاء»: تختفي الأسرة ومنتجاتها عن الزوار وتبقى في قائمة الإدارة، وتعود كما كانت بعد إصلاح وضعها.
--   حالة مستقلة 'hidden'، فكل ما يعرض الأسر المعتمدة فقط يستثنيها تلقائيًا.
-- «توثيق»: علامة توثيق مستقلة تضعها الإدارة يدويًا.
ALTER TABLE jdatna.producer_profiles DROP CONSTRAINT IF EXISTS producer_profiles_status_check;
ALTER TABLE jdatna.producer_profiles ADD CONSTRAINT producer_profiles_status_check
  CHECK (status IN ('pending','approved','rejected','suspended','closed','hidden'));
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS admin_verified_at timestamptz;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS admin_verified_by uuid REFERENCES jdatna.users(id) ON DELETE SET NULL;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS hidden_reason text CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 1000);
