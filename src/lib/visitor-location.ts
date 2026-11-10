"use client";
import type { LatLng } from "./geo";

let cached: LatLng | null = null;
let pending: Promise<LatLng | null> | null = null;

/**
 * موقع الزائر لهذه الزيارة: يُطلب من المتصفح عند الدخول ويبقى في الذاكرة فقط
 * (لا يُكتب في تخزين الجهاز، ولا يُرسل للخادم إلا عند فحص التغطية). يعيد null إن رُفض.
 */
export function visitorLocation(): Promise<LatLng | null> {
  if (cached) return Promise.resolve(cached);
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve(null);
  pending ??= new Promise<LatLng | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cached = [pos.coords.latitude, pos.coords.longitude];
        resolve(cached);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }).finally(() => {
    pending = null;
  });
  return pending;
}
