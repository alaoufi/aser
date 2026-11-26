/**
 * منطقة الزائر لهذه الزيارة فقط (قرار المالك 2026-11-26): كل دخول جديد يبدأ بكل المناطق وكل الأسر.
 * ملف جلسة بلا مدة، فيُمسح بإغلاق المتصفح، ولا يُحدَّد من موقع الزائر.
 * الاسم جديد عمدًا: ملف «jdatna_region» القديم كان يبقى سنة، فيُهمل.
 */
export const REGION_COOKIE = "jdatna_visit_region";

export function setVisitRegion(region: string) {
  document.cookie = `${REGION_COOKIE}=${encodeURIComponent(region)}; path=/; samesite=lax`;
}
