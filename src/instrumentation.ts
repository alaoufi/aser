/**
 * عند بدء الخادم: دورة «تنبيهات الأسرة» كل خمس دقائق (طلب المالك 2026-11-26)، تعلن جداول التوزيع التي
 * حلّ موعدها وترسل ما تجاوز مهلة التجميع. قفل استشاري في القاعدة يمنع الإرسال المكرر بين النسخ.
 * FAMILY_ALERTS_TIMER=off يوقفها (الاختبارات تشغّل الإرسال بنفسها).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    !process.env.DATABASE_URL ||
    process.env.FAMILY_ALERTS_TIMER === "off"
  )
    return;
  const { dispatchFamilyAlerts } = await import("./server/family-alerts");
  const run = () => void dispatchFamilyAlerts().catch(() => {});
  setTimeout(run, 30_000).unref?.();
  setInterval(run, 5 * 60_000).unref?.();
}
