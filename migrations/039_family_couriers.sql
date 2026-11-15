-- المندوب الخاص بالأسرة: تسجّله الأسرة المنتجة بنفسها (الاسم والجوال ونوع السيارة) دون اعتماد الإدارة،
-- بتعهّد منها بمعرفته ومسؤوليتها عنه، ويظهر لأسرته فقط بشارة «مندوب خاص لـ (اسم الأسرة)».
-- وبلاغ المحادثة يحفظ الشخص المبلَّغ عنه لتراه الإدارة باسمه.
-- أعمدة جديدة فقط؛ المندوبون العامّون وبياناتهم لا تتغير (رقم الهوية يبقى إلزاميًا لهم).
BEGIN;
ALTER TABLE jdatna.courier_profiles
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES jdatna.producer_profiles(id),
  ADD COLUMN IF NOT EXISTS pledged_by uuid REFERENCES jdatna.users(id),
  ADD COLUMN IF NOT EXISTS pledged_at timestamptz;
ALTER TABLE jdatna.courier_profiles ALTER COLUMN national_id_encrypted DROP NOT NULL;
ALTER TABLE jdatna.courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_identity_check;
ALTER TABLE jdatna.courier_profiles ADD CONSTRAINT courier_profiles_identity_check
  CHECK (family_id IS NOT NULL OR national_id_encrypted IS NOT NULL);
ALTER TABLE jdatna.courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_pledge_check;
ALTER TABLE jdatna.courier_profiles ADD CONSTRAINT courier_profiles_pledge_check
  CHECK (family_id IS NULL OR (pledged_by IS NOT NULL AND pledged_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS courier_profiles_family ON jdatna.courier_profiles(family_id) WHERE family_id IS NOT NULL;
ALTER TABLE jdatna.reports ADD COLUMN IF NOT EXISTS reported_user_id uuid REFERENCES jdatna.users(id);
COMMIT;
