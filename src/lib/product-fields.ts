/** حقول نموذج «إضافة منتج» التي تتحكم الإدارة في إظهارها وإخفائها وحذفها. */
export const productFieldLabels = {
  library: "اختيار صورة من مكتبة الصور",
  unit: "وحدة البيع",
  status: "التوفر",
  price: "السعر بالريال",
  description: "تفاصيل المنتج",
  deliveryScope: "نطاق توصيل المنتج",
  allergens: "مسببات الحساسية",
  ingredients: "المكونات",
  storage: "شروط الحفظ والتبريد",
  shelfLife: "مدة الصلاحية",
  preparationTime: "وقت التجهيز",
  story: "قصة الأكلة",
} as const;
export type ProductFieldKey = keyof typeof productFieldLabels;
export const productFieldKeys = Object.keys(
  productFieldLabels,
) as ProductFieldKey[];
/** «shown» ظاهر، «hidden» مخفي مؤقتًا، «deleted» محذوف من النموذج ويمكن استعادته. */
export type ProductFieldState = "shown" | "hidden" | "deleted";
export type ProductFields = Record<ProductFieldKey, ProductFieldState>;
export const isProductFieldKey = (k: string): k is ProductFieldKey =>
  k in productFieldLabels;
export const defaultProductFields = (): ProductFields =>
  Object.fromEntries(
    productFieldKeys.map((k) => [k, "shown"]),
  ) as ProductFields;
/** هل يظهر الحقل في نموذج الأسرة؟ */
export const fieldShown = (f: ProductFields | null, k: ProductFieldKey) =>
  !f || f[k] === "shown";
