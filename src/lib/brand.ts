import type { CSSProperties } from "react";

/**
 * مكتبة الهويات.
 * - هوية الأسرة = لون + زخرفة + تأثير ثلاثي الأبعاد خفيف + حجم الزخرفة (آلاف التركيبات).
 *   تظهر في الخلفية والشكل.
 * - هوية القسم = إطار (برواز وحدود).
 * - المنتج يدمج الهويتين: خلفية أسرته وزخرفتها وتأثيرها، داخل إطار قسمه وبلون أسرته.
 * العناصر المميزة (premium) معزولة للهويات المدفوعة (tier = "pro").
 */
export type BrandPalette = {
  id: string;
  name: string;
  bg: string;
  accent: string;
  ink: string;
  premium?: boolean;
};
export type BrandItem = { id: string; name: string; premium?: boolean };

export const brandPalettes: BrandPalette[] = [
  {
    id: "saffron",
    name: "زعفران",
    bg: "#fbf1d9",
    accent: "#b97d12",
    ink: "#43300a",
  },
  {
    id: "palm",
    name: "نخيل",
    bg: "#eef3e4",
    accent: "#4f5d36",
    ink: "#29331d",
  },
  {
    id: "pomegranate",
    name: "رمان",
    bg: "#f9e6e2",
    accent: "#9c2f1e",
    ink: "#4a150c",
  },
  {
    id: "dates",
    name: "تمر",
    bg: "#f3e7da",
    accent: "#7a4a26",
    ink: "#3b2312",
  },
  { id: "sea", name: "بحر", bg: "#e6eff4", accent: "#2f5f7a", ink: "#163242" },
  {
    id: "henna",
    name: "حناء",
    bg: "#f8eadc",
    accent: "#a94f24",
    ink: "#4a220e",
  },
  {
    id: "basil",
    name: "ريحان",
    bg: "#e7f2ee",
    accent: "#2d7158",
    ink: "#153a2c",
  },
  {
    id: "lavender",
    name: "خزامى",
    bg: "#eeeaf5",
    accent: "#654a86",
    ink: "#312346",
  },
  {
    id: "turmeric",
    name: "كركم",
    bg: "#fbf3d2",
    accent: "#9a7a0c",
    ink: "#3d3005",
  },
  {
    id: "rose",
    name: "ورد طائفي",
    bg: "#fbe8ee",
    accent: "#a33a5c",
    ink: "#4a1426",
  },
  {
    id: "cardamom",
    name: "هيل",
    bg: "#edf2e2",
    accent: "#5f7a2c",
    ink: "#2b3812",
  },
  { id: "clay", name: "طين", bg: "#f5e9e0", accent: "#8c5a3c", ink: "#3f2617" },
  {
    id: "emerald",
    name: "زمرد",
    bg: "#e3f3ec",
    accent: "#1f7a52",
    ink: "#0f3a26",
    premium: true,
  },
  {
    id: "turquoise",
    name: "فيروز",
    bg: "#e2f3f4",
    accent: "#1d7c86",
    ink: "#0d393e",
    premium: true,
  },
  {
    id: "ruby",
    name: "ياقوت",
    bg: "#fae4e6",
    accent: "#a01d36",
    ink: "#4a0d18",
    premium: true,
  },
  {
    id: "royal",
    name: "ذهب ملكي",
    bg: "#fbf0d6",
    accent: "#a87a1a",
    ink: "#3e2b06",
    premium: true,
  },
];

/** الزخارف: بلاطة 40×40 تتكرر بلون الأسرة وبشفافية خفيفة. */
const tiles: Record<string, string> = {
  plain: "",
  najmah:
    "<g fill='none' stroke='C' stroke-width='1.2'><rect x='12' y='12' width='16' height='16'/><rect x='12' y='12' width='16' height='16' transform='rotate(45 20 20)'/></g>",
  dots: "<circle cx='20' cy='20' r='2.2' fill='C'/><circle cx='0' cy='0' r='1.4' fill='C'/><circle cx='40' cy='40' r='1.4' fill='C'/>",
  diamonds:
    "<path d='M20 5 35 20 20 35 5 20Z' fill='none' stroke='C' stroke-width='1.2'/>",
  waves:
    "<path d='M0 14q10-10 20 0t20 0M0 30q10-10 20 0t20 0' fill='none' stroke='C' stroke-width='1.2'/>",
  hexagons:
    "<path d='M20 3 35 11.5v17L20 37 5 28.5v-17Z' fill='none' stroke='C' stroke-width='1.2'/>",
  sadu: "<path d='M0 40 10 28 20 40 30 28 40 40M0 12 10 0 20 12 30 0 40 12' fill='none' stroke='C' stroke-width='1.2'/><path d='M20 16l4 4-4 4-4-4Z' fill='C'/>",
  najdi:
    "<path d='M0 34h8v-8h8v-8h8v8h8v8h8' fill='none' stroke='C' stroke-width='1.2'/><path d='M16 10l4-4 4 4' fill='none' stroke='C'/>",
  palm: "<path d='M20 36V8M20 30C20 20 14 13 7 10M20 30C20 20 26 13 33 10M20 22C17 17 13 15 9 15M20 22c3-5 7-7 11-7' fill='none' stroke='C' stroke-width='1.1'/>",
  crescents: "<path d='M24 11a9 9 0 1 0 0 18a12 12 0 0 1 0-18z' fill='C'/>",
  scales:
    "<path d='M0 20a10 10 0 0 1 20 0a10 10 0 0 1 20 0M-10 40a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0' fill='none' stroke='C' stroke-width='1.1'/>",
  chevron:
    "<path d='M0 15 10 5 20 15 30 5 40 15M0 35 10 25 20 35 30 25 40 35' fill='none' stroke='C' stroke-width='1.2'/>",
  girih:
    "<polygon points='20,3 24,14 36,14 26,21 30,33 20,26 10,33 14,21 4,14 16,14' fill='none' stroke='C' stroke-width='1.1'/><circle cx='20' cy='19' r='4' fill='none' stroke='C'/>",
  arabesque:
    "<path d='M20 20c0-7 7-11 11-7s0 11-6 9M20 20c0 7-7 11-11 7s0-11 6-9M20 20c7 0 11 7 7 11s-11 0-9-6M20 20c-7 0-11-7-7-11s11 0 9 6' fill='none' stroke='C' stroke-width='1'/>",
  mashrabiya:
    "<path d='M0 0 40 40M40 0 0 40M20 0v40M0 20h40' stroke='C' stroke-width='.8'/><circle cx='20' cy='20' r='7' fill='none' stroke='C' stroke-width='1.2'/>",
  rosette: [0, 60, 120, 180, 240, 300]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx='${(20 + 7 * Math.cos(r)).toFixed(2)}' cy='${(20 + 7 * Math.sin(r)).toFixed(2)}' r='7' fill='none' stroke='C' stroke-width='.9'/>`;
    })
    .join(""),
};
export const brandPatterns: BrandItem[] = [
  { id: "plain", name: "سادة" },
  { id: "najmah", name: "نجمة إسلامية" },
  { id: "dots", name: "نقاط" },
  { id: "diamonds", name: "معينات" },
  { id: "waves", name: "أمواج" },
  { id: "hexagons", name: "سداسيات" },
  { id: "sadu", name: "سدو" },
  { id: "najdi", name: "نجدي" },
  { id: "palm", name: "سعف" },
  { id: "crescents", name: "أهلّة" },
  { id: "scales", name: "قشور" },
  { id: "chevron", name: "متعرج" },
  { id: "girih", name: "جيريه", premium: true },
  { id: "arabesque", name: "أرابيسك", premium: true },
  { id: "mashrabiya", name: "مشربية", premium: true },
  { id: "rosette", name: "وردة إسلامية", premium: true },
];
/** تأثيرات خفيفة ثلاثية الأبعاد. */
export const brandEffects: BrandItem[] = [
  { id: "soft", name: "ناعم" },
  { id: "raised", name: "بارز" },
  { id: "glow", name: "ضوء" },
  { id: "glass", name: "لمعة" },
  { id: "gold", name: "رقائق ذهب", premium: true },
  { id: "carved", name: "محفور", premium: true },
];
export const brandScales = [
  { id: 1, name: "دقيقة", size: 28 },
  { id: 2, name: "متوسطة", size: 44 },
  { id: 3, name: "كبيرة", size: 68 },
];
/** إطارات الأقسام (البرواز والحدود). */
export const categoryFrames: BrandItem[] = [
  { id: "simple", name: "بسيط" },
  { id: "double", name: "مزدوج" },
  { id: "stitched", name: "مخيط" },
  { id: "arch", name: "قوس نجدي" },
  { id: "bevel", name: "مشطوف بارز" },
  { id: "groove", name: "محفور" },
  { id: "ridge", name: "حافة" },
  { id: "corners", name: "زوايا مزخرفة" },
  { id: "gold", name: "خيط ذهبي" },
  { id: "dotted", name: "منقط" },
  { id: "ribbon", name: "شريط" },
  { id: "notched", name: "زوايا متقابلة" },
];

export type BrandChoice = {
  palette?: string | null;
  pattern?: string | null;
  effect?: string | null;
  scale?: number | null;
};

/** عدد تركيبات هوية الأسرة، ومع إطارات الأقسام لهويات المنتجات. */
export const identityCount = {
  family:
    brandPalettes.length *
    brandPatterns.length *
    brandEffects.length *
    brandScales.length,
  product:
    brandPalettes.length *
    brandPatterns.length *
    brandEffects.length *
    brandScales.length *
    categoryFrames.length,
};

function hash(seed: string, salt: string) {
  let h = 2166136261;
  for (const ch of (seed ?? "") + salt)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
/** الافتراضي من المجاني فقط (لا يمنح المميز). */
function pick<T extends { premium?: boolean }>(
  list: T[],
  seed: string,
  salt: string,
) {
  const free = list.filter((x) => !x.premium);
  return free[hash(seed, salt) % free.length];
}

/** هوية الأسرة: اختيارها، وإلا هوية ثابتة مشتقة من معرّفها (فلا تبقى بطاقة بيضاء). */
export function resolveBrand(seed: string, choice?: BrandChoice | null) {
  const c = choice ?? {};
  return {
    palette:
      brandPalettes.find((p) => p.id === c.palette) ??
      pick(brandPalettes, seed, "palette"),
    pattern:
      brandPatterns.find((p) => p.id === c.pattern) ??
      pick(brandPatterns, seed, "pattern"),
    effect:
      brandEffects.find((p) => p.id === c.effect) ??
      pick(brandEffects, seed, "effect"),
    scale:
      brandScales.find((s) => s.id === c.scale) ??
      brandScales[hash(seed, "scale") % brandScales.length],
  };
}
/** للتوافق: لون الأسرة. */
export function paletteFor(seed: string, chosen?: string | null) {
  return resolveBrand(seed, { palette: chosen }).palette;
}
export function frameFor(categoryId?: string | null, chosen?: string | null) {
  return (
    categoryFrames.find((f) => f.id === chosen) ??
    (categoryId
      ? categoryFrames[hash(categoryId, "frame") % categoryFrames.length]
      : categoryFrames[0])
  );
}

export function patternUrl(patternId: string, color: string, opacity = 0.14) {
  const tile = tiles[patternId];
  if (!tile) return "none";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><g opacity='${opacity}'>${tile.replaceAll("'C'", `'${color}'`)}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** الصنف والمتغيرات لعنصر يحمل هوية الأسرة، ومعها إطار القسم إن وُجد. */
export function identityProps(
  seed: string,
  choice?: BrandChoice | null,
  frame?: { categoryId?: string | null; chosen?: string | null } | null,
): { className: string; style: CSSProperties } {
  const b = resolveBrand(seed, choice);
  const f = frame ? frameFor(frame.categoryId, frame.chosen) : null;
  return {
    className: `branded fx-${b.effect.id}${f ? ` frame-${f.id}` : ""}`,
    style: {
      "--brand-bg": b.palette.bg,
      "--brand-accent": b.palette.accent,
      "--brand-ink": b.palette.ink,
      "--brand-pattern": patternUrl(b.pattern.id, b.palette.accent),
      "--brand-size": `${b.scale.size}px`,
    } as CSSProperties,
  };
}
/** للتوافق مع الاستخدامات السابقة. */
export function brandStyle(seed: string, chosen?: string | null) {
  return identityProps(seed, { palette: chosen }).style;
}

export const brandIds = {
  palettes: brandPalettes.map((p) => p.id) as [string, ...string[]],
  patterns: brandPatterns.map((p) => p.id) as [string, ...string[]],
  effects: brandEffects.map((p) => p.id) as [string, ...string[]],
  frames: categoryFrames.map((p) => p.id) as [string, ...string[]],
};
export const brandPaletteIds = brandIds.palettes;
export function isPremium(choice: BrandChoice) {
  return Boolean(
    brandPalettes.find((p) => p.id === choice.palette)?.premium ||
    brandPatterns.find((p) => p.id === choice.pattern)?.premium ||
    brandEffects.find((p) => p.id === choice.effect)?.premium,
  );
}
