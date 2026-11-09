-- دخول الإدارة بخطوتين: كلمة المرور ثم رمز SMS. غرض جديد لرموز التحقق فقط، دون تغيير بيانات.
BEGIN;
ALTER TABLE jdatna.otp_challenges DROP CONSTRAINT IF EXISTS otp_purpose;
ALTER TABLE jdatna.otp_challenges ADD CONSTRAINT otp_purpose CHECK(purpose IN ('signup','reset','admin'));
COMMIT;
