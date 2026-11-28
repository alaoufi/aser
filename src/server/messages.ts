import { type SiteTextKey, siteTextDefaults } from "../lib/site-texts";

/**
 * نصوص الرسائل والتنبيهات المرسلة من الخادم (قرار المالك 2026-11-28): كلها من «نصوص الموقع»
 * لتعدّلها الإدارة، و{name} وأمثالها تُملأ وقت الإرسال. النص المحذوف يعود لأصله فلا تخرج رسالة فارغة.
 * تُقرأ مرة كل دقيقة على الأكثر، لا مع كل رسالة.
 */
let cached: { at: number; texts: Record<string, string> } | null = null;

async function texts() {
  if (cached && Date.now() - cached.at < 60_000) return cached.texts;
  try {
    const { readSiteTexts } = await import("./settings");
    cached = { at: Date.now(), texts: await readSiteTexts() };
  } catch {
    cached = { at: Date.now(), texts: { ...siteTextDefaults } };
  }
  return cached.texts;
}

export function fillText(
  text: string,
  vars?: Record<string, string | number | null | undefined>,
) {
  return vars
    ? text.replace(/\{(\w+)\}/g, (m, k: string) =>
        vars[k] === undefined || vars[k] === null ? m : String(vars[k]),
      )
    : text;
}

export async function msg(
  key: SiteTextKey,
  vars?: Record<string, string | number | null | undefined>,
) {
  const all = await texts();
  return fillText(all[key] || siteTextDefaults[key], vars);
}

/** للاختبارات: تعديل النصوص يظهر فورًا. */
export function resetMessageTexts() {
  cached = null;
}
