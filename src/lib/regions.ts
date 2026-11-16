import type { City } from "./types";
export const regionOrder = [
  "riyadh",
  "makkah",
  "madinah",
  "qassim",
  "eastern",
  "asir",
  "tabuk",
  "hail",
  "northern",
  "jazan",
  "najran",
  "baha",
  "jawf",
];
export function compareRegions(
  a: { id: string; name: string },
  b: { id: string; name: string },
) {
  const rank = (id: string) => {
    const i = regionOrder.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "ar");
}
/**
 * ترتيب المدن داخل كل منطقة كما هو متبع: مقر الإمارة أولًا، ثم المحافظات الكبرى،
 * ثم البقية أبجديًا. (بالاسم، لأن معرّفات أغلب المدن مولّدة.)
 */
export const cityOrder: Record<string, string[]> = {
  riyadh: [
    "الرياض",
    "الخرج",
    "الدرعية",
    "المجمعة",
    "الدوادمي",
    "وادي الدواسر",
    "الزلفي",
    "شقراء",
    "الأفلاج",
    "القويعية",
    "عفيف",
    "السليل",
    "حوطة بني تميم",
    "المزاحمية",
  ],
  makkah: [
    "مكة المكرمة",
    "جدة",
    "الطائف",
    "القنفذة",
    "الليث",
    "رابغ",
    "الجموم",
    "خليص",
    "الخرمة",
    "رنية",
    "تربة",
    "الكامل",
    "بحرة",
  ],
  madinah: [
    "المدينة المنورة",
    "ينبع",
    "العلا",
    "مهد الذهب",
    "الحناكية",
    "بدر",
    "خيبر",
    "العيص",
    "وادي الفرع",
  ],
  qassim: [
    "بريدة",
    "عنيزة",
    "الرس",
    "المذنب",
    "البكيرية",
    "البدائع",
    "الأسياح",
    "النبهانية",
    "عيون الجواء",
    "رياض الخبراء",
    "الشماسية",
  ],
  eastern: [
    "الدمام",
    "الأحساء",
    "الهفوف",
    "المبرز",
    "الخبر",
    "الظهران",
    "القطيف",
    "الجبيل",
    "حفر الباطن",
    "الخفجي",
    "رأس تنورة",
    "بقيق",
    "النعيرية",
    "قرية العليا",
  ],
  asir: [
    "أبها",
    "خميس مشيط",
    "بيشة",
    "النماص",
    "محايل",
    "سراة عبيدة",
    "رجال ألمع",
    "أحد رفيدة",
    "ظهران الجنوب",
    "تثليث",
    "بلقرن",
    "المجاردة",
    "البرك",
    "بارق",
    "تنومة",
  ],
  tabuk: ["تبوك", "الوجه", "ضباء", "تيماء", "أملج", "حقل", "البدع"],
  hail: [
    "حائل",
    "بقعاء",
    "الغزالة",
    "الشنان",
    "الحائط",
    "السليمي",
    "الشملي",
    "موقق",
    "سميراء",
  ],
  northern: ["عرعر", "رفحاء", "طريف", "العويقيلة"],
  jazan: [
    "جازان",
    "صبيا",
    "أبو عريش",
    "صامطة",
    "الحرث",
    "ضمد",
    "الريث",
    "بيش",
    "فرسان",
    "الدائر",
    "أحد المسارحة",
    "العيدابي",
    "العارضة",
    "الدرب",
    "هروب",
    "فيفاء",
    "الطوال",
  ],
  najran: ["نجران", "شرورة", "حبونا", "بدر الجنوب", "يدمة", "ثار", "خباش"],
  baha: [
    "الباحة",
    "بلجرشي",
    "المندق",
    "المخواة",
    "قلوة",
    "العقيق",
    "القرى",
    "بني حسن",
    "غامد الزناد",
    "الحجرة",
  ],
  jawf: ["سكاكا", "القريات", "دومة الجندل", "طبرجل", "صوير"],
};
/** المنطقة بالترتيب الرسمي، ثم المدينة بترتيبها داخل منطقتها. */
export function compareCities(
  a: { name: string; regionId: string; regionName?: string },
  b: { name: string; regionId: string; regionName?: string },
) {
  const byRegion = compareRegions(
    { id: a.regionId, name: a.regionName ?? a.regionId },
    { id: b.regionId, name: b.regionName ?? b.regionId },
  );
  if (byRegion) return byRegion;
  const rank = (c: { name: string; regionId: string }) => {
    const i = (cityOrder[c.regionId] ?? []).indexOf(c.name);
    return i < 0 ? 999 : i;
  };
  return rank(a) - rank(b) || a.name.localeCompare(b.name, "ar");
}
export function regionOptions(cities: City[]): [string, string][] {
  return Array.from(
    new Map(cities.map((c) => [c.regionId, c.regionName])),
  ).sort((a, b) =>
    compareRegions({ id: a[0], name: a[1] }, { id: b[0], name: b[1] }),
  );
}
