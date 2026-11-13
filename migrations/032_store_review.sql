-- مراجعة المتاجر (Apple وGoogle): حسابا مراجعة يدخلان بكلمة مرور، وأسرة تجريبية لا تظهر في القوائم العامة.
-- أعمدة جديدة بقيم افتراضية فقط، دون تغيير بيانات قائمة.
BEGIN;
ALTER TABLE jdatna.users ADD COLUMN IF NOT EXISTS review_account boolean NOT NULL DEFAULT false;
ALTER TABLE jdatna.producer_profiles ADD COLUMN IF NOT EXISTS review_only boolean NOT NULL DEFAULT false;
COMMIT;
