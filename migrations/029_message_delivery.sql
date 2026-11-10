-- علامات وصول الرسائل كواتساب: وقت آخر استلام لكل طرف (✓✓ رمادي)، والقراءة قائمة (✓✓ أزرق).
-- أعمدة جديدة فقط بقيمة افتراضية، دون تغيير بيانات قائمة.
BEGIN;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS customer_delivered_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS producer_delivered_at timestamptz NOT NULL DEFAULT now();
COMMIT;
