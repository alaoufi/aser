/**
 * الحماية من الإغراق: عدّاد في ذاكرة الخادم لكل عنوان زائر وكل نوع طلب، بنافذة دقيقة.
 * خفيف جدًا (لا قاعدة بيانات لكل طلب)، ويُقطع الإغراق قبل أن يصل لأي صفحة أو API.
 * الحدود سخية لأن مستخدمي الجوال قد يتشاركون عنوانًا واحدًا (CGNAT).
 */
export type FloodBucket =
  "page" | "prefetch" | "api-read" | "api-write" | "live";

/** الحد الأقصى في الدقيقة لكل عنوان. */
export const FLOOD_LIMITS: Record<FloodBucket, number> = {
  page: 240,
  // التحميل المسبق للروابط (Next يرسله تلقائيًا، عشرات لكل صفحة): خانة مستقلة سخية، حتى لا يأكل
  // حد الصفحات فيُحجب متصفح عادي بعد بضع صفحات (مراجعة 2026-11-24).
  prefetch: 1500,
  "api-read": 600,
  "api-write": 90,
  live: 30,
};

type Counter = { count: number; reset: number };
const store: Map<string, Counter> = ((
  globalThis as unknown as { __jdatnaFlood?: Map<string, Counter> }
).__jdatnaFlood ??= new Map());

/** نوع الطلب: صفحة، أو قراءة API، أو تعديل، أو فتح بث لحظي. */
export function floodBucket(
  method: string,
  path: string,
  prefetch = false,
): FloodBucket {
  if (path === "/api/live") return "live";
  if (path.startsWith("/api/"))
    return method === "GET" || method === "HEAD" ? "api-read" : "api-write";
  return prefetch && (method === "GET" || method === "HEAD")
    ? "prefetch"
    : "page";
}

/**
 * يحسب الطلب ويرد: مسموح، أو محظور مع ثواني الانتظار، و`first` لأول رفض في النافذة
 * (يُسجَّل مرة واحدة لا مع كل طلب).
 */
export function floodCheck(
  ip: string,
  bucket: FloodBucket,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfter: number; first: boolean } {
  const key = `${bucket}:${ip}`;
  let c = store.get(key);
  if (!c || c.reset <= now) {
    c = { count: 0, reset: now + 60_000 };
    store.set(key, c);
  }
  c.count++;
  // تنظيف دوري حتى لا تكبر الذاكرة مع عناوين كثيرة.
  if (store.size > 50_000)
    for (const [k, v] of store) if (v.reset <= now) store.delete(k);
  const limit = FLOOD_LIMITS[bucket];
  if (c.count <= limit) return { ok: true };
  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil((c.reset - now) / 1000)),
    first: c.count === limit + 1,
  };
}

/** لاختبار الوحدة فقط. */
export function floodReset() {
  store.clear();
}
