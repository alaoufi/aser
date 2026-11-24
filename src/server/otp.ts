import { randomInt } from "node:crypto";
/**
 * رمز التحقق ستة أرقام (مراجعة أمنية 2026-11-24): الأربعة (9000 احتمال) تُخمَّن على مدى أيام
 * في «نسيت كلمة المرور» لجوالات الأسر المنشورة. الستة 900 ألف احتمال.
 * يُقبل إدخال أربعة أرقام أيضًا لرمز حساب مراجعة المتاجر الثابت (store-review) فقط؛ الرموز المرسلة كلها ستة.
 */
export const OTP_LENGTH = 6;
export const otpCodePattern = /^(\d{4}|\d{6})$/;
export const createOtp = () => String(randomInt(100000, 1000000));
