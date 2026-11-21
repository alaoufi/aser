/**
 * الإعلانات الترويجية (من المكتبة المشتركة code/promo-ads، «أي خدمة» 1.1.137، AYK-403 إلى AYK-421):
 * الأماكن وإطار كل مكان، وقواعد العرض (الجدولة، والاستهداف، والأولوية والوزن). دوال خالصة تعمل في
 * الخادم والمتصفح.
 */

/** أماكن الإعلان في جدتنا. كلها إطار عريض 1200×400 فلا يتشوه المكان. */
export const PLACEMENTS = {
  home_top: { label: "الرئيسية: أعلى الصفحة", page: "/" },
  home_middle: { label: "الرئيسية: الوسط", page: "/" },
  home_bottom: { label: "الرئيسية: أسفل الصفحة", page: "/" },
  browse_top: { label: "طبخات اليوم: أعلى", page: "/browse" },
  browse_bottom: { label: "طبخات اليوم: أسفل", page: "/browse" },
  producers_top: { label: "الأسر المنتجة: أعلى", page: "/producers" },
  producer_page: { label: "صفحة الأسرة", page: "/producers/…" },
  product_page: { label: "صفحة المنتج", page: "/products/…" },
  offers_top: { label: "العروض الخاصة: أعلى", page: "/offers" },
  akalat_top: { label: "دليل الأكلات الشعبية", page: "/akalat" },
} as const;
export type Placement = keyof typeof PLACEMENTS;
export const PLACEMENT_IDS = Object.keys(PLACEMENTS) as Placement[];
export const isPlacement = (p: unknown): p is Placement =>
  typeof p === "string" && p in PLACEMENTS;

/** إطار الإعلان الثابت (AYK-408): الصورة تُقص وتُعدَّل له ولا تُمطَّط. */
export const AD_FRAME = { width: 1200, height: 400 } as const;
/** المقطع قصير، فلا يثقل الصفحة (AYK-421). */
export const MAX_AD_VIDEO_SECONDS = 30;
export const MAX_AD_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_AD_VIDEO_BYTES = 15 * 1024 * 1024;

/** يناسب الإطار إن كان شكله ضمن 6% منه وعرضه 3/4 عرض الإطار على الأقل. */
export function fitsFrame(
  { width, height }: { width: number; height: number },
  frame: { width: number; height: number } = AD_FRAME,
) {
  if (!width || !height) return false;
  const ratio = width / height / (frame.width / frame.height);
  return ratio > 0.94 && ratio < 1.06 && width >= frame.width * 0.75;
}

export const WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export type AdSchedule = { days?: number[]; from?: string; to?: string };
const SAUDI_OFFSET_MIN = 180;
export function saudiNow(now = new Date()) {
  const t = new Date(now.getTime() + SAUDI_OFFSET_MIN * 60000);
  return {
    day: t.getUTCDay(),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}
const toMinutes = (hhmm?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** الجدولة الأسبوعية بتوقيت السعودية؛ النافذة بعد منتصف الليل (20:00 إلى 02:00) تلتف. */
export function inSchedule(
  schedule: AdSchedule | null | undefined,
  now = new Date(),
) {
  if (!schedule || typeof schedule !== "object") return true;
  const { day, minutes } = saudiNow(now);
  const days = (Array.isArray(schedule.days) ? schedule.days : []).map(Number);
  if (days.length && !days.includes(day)) return false;
  const from = toMinutes(schedule.from);
  const to = toMinutes(schedule.to);
  if (from == null || to == null || from === to) return true;
  return from < to
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to;
}

export type AdAudience = "guest" | "customer" | "producer";
export type AdContext = {
  device: "mobile" | "desktop";
  audience: AdAudience;
  region: string | null;
};
export type DeliverableAd = {
  priority: number;
  weight: number;
  schedule: AdSchedule | null;
  target_devices: string[];
  target_audience: string[];
  target_regions: string[];
  exclusive: boolean;
};
export function deviceOf(userAgent: string): AdContext["device"] {
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
}
/** الاستهداف: الجهاز، والجمهور، والمنطقة (الفارغ = الكل). منطقة مستهدفة تحتاج زائرًا معروفة منطقته. */
export function matchesContext(ad: DeliverableAd, ctx: AdContext) {
  if (ad.target_devices.length && !ad.target_devices.includes(ctx.device))
    return false;
  if (ad.target_audience.length && !ad.target_audience.includes(ctx.audience))
    return false;
  if (
    ad.target_regions.length &&
    !(ctx.region && ad.target_regions.includes(ctx.region))
  )
    return false;
  return true;
}
/**
 * الترتيب: الأولوية أولًا (1 عالية، 2 عادية، 3 احتياطية)، ثم سحب عشوائي بالوزن داخل الأولوية الواحدة
 * (Efraimidis–Spirakis)، فإعلان وزنه 3 يأتي أولًا نحو ثلاثة أضعاف إعلان وزنه 1.
 */
export function orderAds<T extends DeliverableAd>(
  ads: T[],
  random = Math.random,
) {
  return ads
    .map((ad) => ({
      ad,
      p: Number(ad.priority) || 2,
      k: random() ** (1 / Math.max(1, Number(ad.weight) || 1)),
    }))
    .sort((a, b) => a.p - b.p || b.k - a.k)
    .map((x) => x.ad);
}
/** ما يُعرض للزائر: الجدولة والاستهداف، ثم الإعلان الحصري يتقدم، ثم الترتيب. */
export function deliver<T extends DeliverableAd>(
  ads: T[],
  ctx: AdContext,
  now = new Date(),
  random = Math.random,
) {
  const fit = ads.filter(
    (ad) => inSchedule(ad.schedule, now) && matchesContext(ad, ctx),
  );
  const exclusive = fit.filter((ad) => ad.exclusive);
  return orderAds(exclusive.length ? exclusive : fit, random);
}
