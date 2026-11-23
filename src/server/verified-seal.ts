/**
 * رابط «عرض التحقق» لشهادة جدتنا من خدمة ختم المركز السعودي للأعمال (العامة، المصمَّمة للتضمين).
 * الرابط يحمل رمزًا مؤقتًا (vt) تصدره المنصة لساعات، فيُحفظ في الذاكرة ساعة ثم يُجدَّد.
 */
export const VERIFICATION_NUMBER = "0000346762";
export const SEAL_TOKEN = "bzdWdzBVYW5qUnlEZnRkd3hIWFY3QT09";
export const VERIFICATION_INQUIRY =
  "https://eauthenticate.saudibusiness.gov.sa/inquiry";
const SEAL_URL = `https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal?token=${SEAL_TOKEN}&lang=ar&pos=bottom`;
const DETAILS =
  /https:\/\/eauthenticate\.saudibusiness\.gov\.sa\/certificate-details\/(\d{10})\?vt=[A-Za-z0-9._-]+/;
const HOUR = 3_600_000;
let cached: { url: string; at: number } | null = null;

/** يُختبر بمحاكاة fetch. */
export function linkFromSeal(html: string) {
  const m = DETAILS.exec(html.replace(/&amp;/g, "&"));
  return m && m[1] === VERIFICATION_NUMBER ? m[0] : null;
}

export async function sealLink(now = Date.now()): Promise<string> {
  if (cached && now - cached.at < HOUR) return cached.url;
  try {
    const r = await fetch(SEAL_URL, {
      headers: { Referer: "https://jdtna.sa/" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const url = r.ok ? linkFromSeal(await r.text()) : null;
    if (url) {
      cached = { url, at: now };
      return url;
    }
  } catch {
    // المنصة لا ترد: صفحة الاستعلام.
  }
  return cached?.url ?? VERIFICATION_INQUIRY;
}

export function resetSealCache() {
  cached = null;
}
