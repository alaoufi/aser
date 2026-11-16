/**
 * الأرشفة في محركات البحث: العنوان والوصف والكلمات الدلالية والبيانات المنظمة (schema.org).
 * الكلمات ظاهرة في وصف الصفحات ونصوصها الحقيقية، لا مخفية (الحشو المخفي تعاقب عليه Google).
 */
export const SITE_URL = "https://jdatna.com";
export const SITE_NAME = "أكلات جدتنا";
export const SITE_DESCRIPTION =
  "أكلات شعبية وطبخ بيت من الأسر المنتجة السعودية: جريش وقرصان ومرقوق وكبسة وحلويات شعبية ومعمول، تطلبها من الأسرة مباشرة بالتوصيل أو الاستلام في الرياض وجدة ومكة والمدينة والدمام والقصيم وكل المملكة.";

/** كلمات البحث الدلالية: ما يكتبه الناس فعلًا حين يبحثون عن أكل البيت والأسر المنتجة. */
export const SITE_KEYWORDS = [
  "أكلات جدتنا",
  "أكلات شعبية",
  "أكلات سعودية",
  "أكلات شعبية سعودية",
  "طبخ بيت",
  "أكل بيت",
  "أكلات بيتية",
  "أكلات منزلية",
  "مطبخ منزلي",
  "طبخات تراثية",
  "الأسر المنتجة",
  "أسر منتجة",
  "أسر منتجة قريبة مني",
  "طلب أكل بيت",
  "توصيل أكل بيت",
  "أكلات نجدية",
  "أكلات حجازية",
  "أكلات جنوبية",
  "جريش",
  "قرصان",
  "مرقوق",
  "مطازيز",
  "كبسة",
  "معصوب",
  "عريكة",
  "حنيني",
  "كليجا",
  "معمول",
  "سمبوسة",
  "حلويات شعبية",
  "أسر منتجة الرياض",
  "أسر منتجة جدة",
  "أسر منتجة مكة",
  "أسر منتجة المدينة",
  "أسر منتجة الدمام",
  "أسر منتجة القصيم",
  "Saudi home cooked food",
  "productive families Saudi Arabia",
];

/** عمليات بحث شائعة تظهر روابط حقيقية في تذييل كل صفحة (روابط داخلية تساعد الأرشفة). */
export const POPULAR_SEARCHES = [
  "جريش",
  "قرصان",
  "مرقوق",
  "مطازيز",
  "كبسة",
  "معصوب",
  "حنيني",
  "كليجا",
  "معمول",
  "سمبوسة",
  "حلويات",
  "خبز",
];

/** نص قصير لوصف الصفحة (يقطع عند حد كلمة، بلا مسافات زائدة). */
export function excerpt(text: string | null | undefined, max = 155) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return (
    cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : max) + "…"
  );
}

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).href;

/** يحوّل كائن schema.org إلى نص آمن داخل وسم script (لا يُغلق الوسم من داخل البيانات). */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** صورة المشاركة الافتراضية (واتساب وتويتر وغيرها) للصفحات التي بلا صورة خاصة. */
export const DEFAULT_OG_IMAGE = {
  url: "/brand/og-image.jpg",
  width: 1200,
  height: 630,
  alt: "أكلات جدتنا — أكل شعبي سعودي من بيوت الأسر المنتجة",
};
/**
 * بيانات المشاركة: تعريفها في صفحة يستبدل تعريف الموقع كله (لا يدمجه)،
 * فنكمّل هنا النوع واللغة واسم الموقع والصورة الافتراضية.
 */
export function openGraph(og: {
  title?: string;
  description?: string;
  url?: string;
  images?: { url: string; alt?: string }[];
}) {
  return {
    type: "website" as const,
    locale: "ar_SA",
    siteName: SITE_NAME,
    ...og,
    images: og.images?.length ? og.images : [DEFAULT_OG_IMAGE],
  };
}
