/**
 * روابط الاتصال وواتساب من رقم محفوظ (مراجعة 2026-11-24).
 *
 * `cleanPhone` في src/server/directory.ts يحوّل الجوال السعودي إلى +966…، ويترك غيره أرقامًا
 * كما كُتبت (هاتف ثابت 011…، رقم موحّد 920…، مجاني 800…). إضافة «+» لهذه تجعلها مفتاح دولة آخر
 * (920… يصير باكستان)، فلا تُضاف «+» إلا لرقم دولي، ولا يظهر واتساب إلا له.
 */
const digitsOf = (p: string) => p.replace(/\D/g, "");
const international = (p: string) => p.trim().startsWith("+");

export function telHref(phone: string) {
  const d = digitsOf(phone);
  return d ? `tel:${international(phone) ? "+" : ""}${d}` : null;
}

export function whatsappHref(phone: string) {
  const d = digitsOf(phone);
  return d && international(phone) ? `https://wa.me/${d}` : null;
}
