/**
 * رقم الدعوة عبر الحافظة لتطبيق الآيفون (قرار المالك 2026-11-28):
 * تطبيق الآيفون لا يرى ما حفظه Safari، فصفحة الدعوة تنسخ رابط الدعوة بلمسة «حمّل التطبيق»،
 * ثم يقرأ التطبيق الحافظة أول مرة يُفتح فيها (قبل الدخول)، ويحفظ الرقم لصاحب الدعوة.
 * نقرأ الرابط فقط (jdtna.sa/r/رقم)، فلا يُؤخذ أي رقم آخر منسوخ بالخطأ.
 */
export function inviteClipText(origin: string, code: string) {
  return `${origin.replace(/\/+$/, "")}/r/${code}`;
}

const LINK = /(?:jdtna\.sa|jdatna\.com)\/r\/([0-9٠-٩]{1,7})(?![0-9٠-٩])/;

export function parseInviteClip(text: string | null | undefined) {
  const m = LINK.exec(String(text ?? "").slice(0, 2000));
  if (!m) return null;
  return m[1].replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
