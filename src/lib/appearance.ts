/**
 * «المظهر» (طلب المالك 2026-11-26): الزائر يختار قالب الواجهة ولون الموقع.
 * الاختيار في cookie يقرؤه الخادم فيرسم الصفحة باختياره مباشرة (لا وميض)، وفي حساب العضو إن كان مسجلًا.
 * الإدارة تحدد القوالب والألوان المتاحة والافتراضي (src/server/settings.ts).
 */
export const siteTemplates = ["classic", "najdi", "simple"] as const;
export type SiteTemplate = (typeof siteTemplates)[number];

/** لوحات الألوان؛ «السدو» هي الأصلية (بلا سمة على <html>). from/to لون العينة في الاختيار. */
export const PALETTES = [
  { key: "sadu", from: "#4f5d36", to: "#9c2f1e" },
  { key: "nakheel", from: "#2f5d3a", to: "#c9a04a" },
  { key: "teen", from: "#8b4a2b", to: "#d39b55" },
  { key: "qahwa", from: "#5b3a29", to: "#5e7a3a" },
  { key: "zafaran", from: "#7a1f2b", to: "#e0a526" },
  { key: "neel", from: "#2c3e66", to: "#a3402a" },
  { key: "lail", from: "#1b1712", to: "#a9c48f" },
  { key: "contrast", from: "#000000", to: "#ffffff" },
] as const;
export type PaletteKey = (typeof PALETTES)[number]["key"];
export const paletteKeys = PALETTES.map((p) => p.key) as PaletteKey[];
/** اللوحة الداكنة: تُقترح أول زيارة لمن جهازه على الوضع الداكن ولم يختر بعد. */
export const DARK_PALETTE: PaletteKey = "lail";

export const TEMPLATE_COOKIE = "jdatna_template";
export const PALETTE_COOKIE = "jdatna_palette";
/** اختيار «ألوان الموقع» القديم في جهاز الزائر (قبل cookie)؛ يُنقل مرة واحدة. */
export const LEGACY_PALETTE_STORE = "jdatna:palette";
const YEAR = 60 * 60 * 24 * 365;

export function isTemplate(v: unknown): v is SiteTemplate {
  return siteTemplates.includes(v as SiteTemplate);
}
export function isPalette(v: unknown): v is PaletteKey {
  return paletteKeys.includes(v as PaletteKey);
}

/** إعداد الإدارة: المتاح للزائر والافتراضي. الافتراضي دائمًا ضمن المتاح. */
export type AppearanceSettings = {
  template: SiteTemplate;
  templates: SiteTemplate[];
  palette: PaletteKey;
  palettes: PaletteKey[];
};
export const defaultAppearanceSettings: AppearanceSettings = {
  template: "classic",
  templates: [...siteTemplates],
  palette: "sadu",
  palettes: [...paletteKeys],
};

/** يصحح إعدادًا مخزنًا: يحذف المجهول، ويضمن الافتراضي ضمن المتاح. */
export function normalizeAppearance(
  raw: Partial<Record<keyof AppearanceSettings, unknown>>,
): AppearanceSettings {
  const list = <T extends string>(v: unknown, ok: (x: unknown) => x is T) =>
    Array.isArray(v) ? [...new Set(v.filter(ok))] : [];
  const template = isTemplate(raw.template)
    ? raw.template
    : defaultAppearanceSettings.template;
  const palette = isPalette(raw.palette)
    ? raw.palette
    : defaultAppearanceSettings.palette;
  const templates = list(raw.templates, isTemplate);
  const palettes = list(raw.palettes, isPalette);
  return {
    template,
    palette,
    templates: siteTemplates.filter(
      (t) =>
        t === template ||
        (templates.length ? templates : siteTemplates).includes(t),
    ),
    palettes: paletteKeys.filter(
      (p) =>
        p === palette || (palettes.length ? palettes : paletteKeys).includes(p),
    ),
  };
}

/** ما يُرسم لهذا الزائر: اختياره إن كان متاحًا، وإلا الافتراضي. */
export function resolveAppearance(
  settings: AppearanceSettings,
  chosen: { template?: string; palette?: string },
) {
  const template =
    isTemplate(chosen.template) && settings.templates.includes(chosen.template)
      ? chosen.template
      : settings.template;
  const explicit =
    isPalette(chosen.palette) && settings.palettes.includes(chosen.palette);
  const palette = explicit ? (chosen.palette as PaletteKey) : settings.palette;
  return { template, palette, explicitPalette: explicit };
}

export function appearanceCookie(name: string, value: string) {
  return `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/**
 * يُشغَّل قبل رسم الصفحة (نص ثابت من الكود؛ القوائم أسماء من الكود فقط).
 * إن لم يختر الزائر لونًا بعد: ينقل اختياره القديم من الجهاز، وإلا يتبع الوضع الداكن لجهازه.
 */
export function paletteScript(palettes: PaletteKey[]) {
  const allowed = JSON.stringify(palettes.filter((p) => /^[a-z]+$/.test(p)));
  return `try{if(!/(^|; )${PALETTE_COOKIE}=/.test(document.cookie)){var a=${allowed},d=document.documentElement,p=null;try{p=localStorage.getItem("${LEGACY_PALETTE_STORE}")}catch(e){}if(p&&a.indexOf(p)>=0){document.cookie="${PALETTE_COOKIE}="+p+"; path=/; max-age=${YEAR}; samesite=lax"}else{p=null;if(a.indexOf("${DARK_PALETTE}")>=0&&matchMedia("(prefers-color-scheme: dark)").matches)p="${DARK_PALETTE}"}if(p){if(p==="sadu")delete d.dataset.palette;else d.dataset.palette=p}}}catch(e){}`;
}
