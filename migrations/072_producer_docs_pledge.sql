-- قرار المالك 2026-11-26: الأسرة تتعهد بتقديم المستندات الرسمية لممارسة النشاط خلال 15 يومًا، وتُعطى
-- كل صلاحيات الأسرة المنتجة فورًا (تظهر للعملاء). بعد المدة بلا مستند: تنبيه الإدارة فقط.
BEGIN;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS docs_pledged_at timestamptz;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS docs_due_at timestamptz;
-- متى نُبّهت الإدارة بتأخر المستندات (مرة واحدة).
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS docs_late_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS producer_profiles_docs_due ON jdatna.producer_profiles(docs_due_at) WHERE docs_due_at IS NOT NULL;
COMMIT;
