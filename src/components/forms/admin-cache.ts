"use client";
import { api } from "./shared";

/**
 * ذاكرة بيانات أقسام الإدارة داخل الصفحة: القسم الذي فُتح من قبل يظهر فورًا
 * ببياناته الأخيرة ثم يُحدَّث في الخلفية، فلا يُنتظر التحميل عند كل تنقل.
 */
export const adminCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
export function fetchAdmin<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const p = api<T>(url)
    .then((d) => {
      adminCache.set(url, d);
      return d;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}
/** تحميل بيانات الأقسام مسبقًا (عند المرور على زر القسم) ليفتح بلا انتظار. */
export function prefetchAdmin(urls: string[]) {
  for (const url of urls)
    if (!adminCache.has(url)) fetchAdmin(url).catch(() => {});
}
