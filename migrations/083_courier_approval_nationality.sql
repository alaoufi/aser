-- قرار المالك 2026-11-28: مندوب الأسرة الخاص لا يُفعَّل إلا بموافقة الإدارة (كان يُعتمد فورًا)،
-- وجنسية المندوب حقل إلزامي في تسجيله، والإدارة تحدد من يستقبل إشعارات الموافقات.
-- المندوبون المفعّلون قبل هذا القرار يبقون كما هم (قرار المالك).
ALTER TABLE jdatna.courier_profiles ADD COLUMN IF NOT EXISTS nationality text
  CHECK (nationality IS NULL OR char_length(nationality) <= 40);
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS approval_alerts boolean NOT NULL DEFAULT true;
