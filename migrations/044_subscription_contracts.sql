-- عقد الاشتراك: يضغط العميل «تم الاتفاق مع الأسرة» ثم توافق الأسرة، فيُحفظ عقد ثابت
-- (شروط الاشتراك ونسخة من المحادثة حتى لحظة الموافقة وبصمتها). يطّلع عليه الطرفان والإدارة،
-- ولا يمكن تعديله ولا حذفه: القاعدة نفسها ترفض ذلك. جداول وأعمدة جديدة فقط؛ جدول الطلبات لا يتغير.
BEGIN;
ALTER TABLE jdatna.subscription_requests ADD COLUMN IF NOT EXISTS customer_agreed_at timestamptz;
CREATE TABLE IF NOT EXISTS jdatna.subscription_contracts (
  id uuid PRIMARY KEY,
  number bigserial UNIQUE,
  subscription_id uuid NOT NULL UNIQUE REFERENCES jdatna.subscription_requests(id) ON DELETE RESTRICT,
  producer_id uuid NOT NULL REFERENCES jdatna.producer_profiles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES jdatna.users(id) ON DELETE RESTRICT,
  family_name text NOT NULL,
  customer_name text NOT NULL,
  terms jsonb NOT NULL,
  transcript jsonb NOT NULL,
  customer_agreed_at timestamptz NOT NULL,
  family_agreed_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_contracts_family ON jdatna.subscription_contracts(producer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_contracts_customer ON jdatna.subscription_contracts(user_id, created_at DESC);
-- العقد ثابت: لا تعديل ولا حذف. (الاختبارات المعزولة وحدها تحذف بضبط jdatna.contract_cleanup داخل معاملتها.)
CREATE OR REPLACE FUNCTION jdatna.subscription_contracts_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('jdatna.contract_cleanup', true) = 'on'
     AND current_database() LIKE 'jdatna_test_%' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'عقد الاشتراك ثابت: لا يمكن تعديله ولا حذفه';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS subscription_contracts_immutable ON jdatna.subscription_contracts;
CREATE TRIGGER subscription_contracts_immutable BEFORE UPDATE OR DELETE ON jdatna.subscription_contracts
  FOR EACH ROW EXECUTE FUNCTION jdatna.subscription_contracts_immutable();
DROP TRIGGER IF EXISTS subscription_contracts_no_truncate ON jdatna.subscription_contracts;
CREATE TRIGGER subscription_contracts_no_truncate BEFORE TRUNCATE ON jdatna.subscription_contracts
  FOR EACH STATEMENT EXECUTE FUNCTION jdatna.subscription_contracts_immutable();
COMMIT;
