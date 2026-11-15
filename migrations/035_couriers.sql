-- المندوب: نوع عضو ثالث (بعد العميل والأسرة المنتجة) يتفق مع الأسر على توصيل طلبات زبائنها.
-- يُعلن لهم في «المندوبين» بعد اعتماد الإدارة. رقم الهوية مشفّر وصورة الهوية مستند خاص.
-- جدول جديد ودور جديد فقط، دون تغيير بيانات قائمة.
BEGIN;
ALTER TABLE jdatna.roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE jdatna.roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('customer','producer','admin','staff','courier'));
INSERT INTO jdatna.roles VALUES ('courier') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS jdatna.courier_profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES jdatna.users(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  city_id text NOT NULL REFERENCES jdatna.cities(id),
  car_type text NOT NULL CHECK (length(btrim(car_type)) BETWEEN 2 AND 80),
  document_id uuid REFERENCES jdatna.producer_documents(id),
  national_id_encrypted bytea NOT NULL,
  show_phone boolean NOT NULL DEFAULT true,
  show_whatsapp boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  review_reason text CHECK (review_reason IS NULL OR length(review_reason) <= 2000),
  reviewer_id uuid REFERENCES jdatna.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_profiles_city ON jdatna.courier_profiles(city_id) WHERE status='approved';
COMMIT;
