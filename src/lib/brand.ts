import type { CSSProperties } from "react";

/**
 * هوية الأسرة: لون تختاره يميّز بطاقتها وبطاقات كل منتجاتها.
 * ألوان مختارة من روح التراث، وكلها مقروءة (تباين النص مع الخلفية مرتفع).
 * مستقبلًا: هويات احترافية مدفوعة (tier = "pro") بألوان وخطوط وشعار مخصّص.
 */
export type BrandPalette = {
  id: string;
  name: string;
  /** خلفية البطاقة (فاتحة). */
  bg: string;
  /** لون الهوية: الشريط والحدود والصورة الرمزية. */
  accent: string;
  /** لون النص على الخلفية. */
  ink: string;
};

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
];

export const brandPaletteIds = brandPalettes.map((p) => p.id) as [
  string,
  ...string[],
];

/** لون الأسرة: ما اختارته، وإلا لون ثابت مشتق من معرّفها (فلا تبقى بطاقة بيضاء). */
export function paletteFor(seed: string, chosen?: string | null) {
  const found = chosen && brandPalettes.find((p) => p.id === chosen);
  if (found) return found;
  let h = 0;
  for (const ch of seed ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return brandPalettes[h % brandPalettes.length];
}

/** متغيرات CSS للبطاقة. */
export function brandStyle(seed: string, chosen?: string | null) {
  const p = paletteFor(seed, chosen);
  return {
    "--brand-bg": p.bg,
    "--brand-accent": p.accent,
    "--brand-ink": p.ink,
  } as CSSProperties;
}
