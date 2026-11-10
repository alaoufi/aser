"use client";
import type { LatLng } from "./geo";

const KEY = "jdatna:visitor-location";
let pending: Promise<LatLng | null> | null = null;

/**
 * موقع الزائر لهذه الزيارة: يُطلب من المتصفح مرة في كل دخول ويُحفظ في الجهاز
 * لهذه الجلسة فقط (لا يُرسل للخادم إلا عند فحص التغطية). يعيد null إن رُفض.
 */
export function visitorLocation(): Promise<LatLng | null> {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (Array.isArray(p) && p.length === 2)
        return Promise.resolve(p as LatLng);
    }
  } catch {
    // التخزين اختياري.
  }
  if (typeof navigator === "undefined" || !navigator.geolocation)
    return Promise.resolve(null);
  pending ??= new Promise<LatLng | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = [pos.coords.latitude, pos.coords.longitude];
        try {
          sessionStorage.setItem(KEY, JSON.stringify(p));
        } catch {
          // التخزين اختياري.
        }
        resolve(p);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }).finally(() => {
    pending = null;
  });
  return pending;
}
