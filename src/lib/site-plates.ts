/** صحن أعلى الرئيسية: منتج حقيقي (آخر الإضافات) أو صورة من صور الموقع. */
export type Plate = {
  id: string;
  name: string;
  image: string;
  /** للمنتج الحقيقي: رابطه وأسرته وسعره وعدد طلباته. */
  href?: string;
  family?: string;
  price?: string;
  orders?: number;
};

/** صور الموقع: تكمّل الصحون إن قلّت المنتجات ذات الصور عن ١٢. */
export const SITE_PLATES: Plate[] = [
  ["rice-plate", "طبق أرز"],
  ["traditional-platter", "مطازيز"],
  ["clay-pot", "مرقوق"],
  ["grain-plate", "جريش"],
  ["fish-tray", "طبق سمك"],
].map(([id, name]) => ({
  id: `site-${id}`,
  name,
  image: `/food/${id}-floating-v2.webp`,
}));
