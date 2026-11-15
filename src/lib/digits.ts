/**
 * أرقام لوحة المفاتيح العربية (٠-٩) والفارسية (۰-۹) إلى أرقام لاتينية (0-9).
 * كثير من الجوالات في السعودية تكتب الأرقام عربية، فتُوحَّد قبل التحقق من الجوال والرمز وكلمة المرور.
 */
export function toAsciiDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)),
  );
}
