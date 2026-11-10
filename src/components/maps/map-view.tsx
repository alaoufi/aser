"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";

export type MapShape = { points: LatLng[]; color: string; label?: string };
/** الرياض افتراضيًا حتى يحدد المستخدم موقعه. */
export const defaultCenter: LatLng = [24.7136, 46.6753];

/**
 * خريطة OpenStreetMap عبر Leaflet: تعرض مناطق مرسومة ونقاط رسم وعلامة،
 * وتُبلغ بموضع الضغط. تُحمَّل في المتصفح فقط.
 */
export function MapView({
  label,
  shapes = [],
  draft = [],
  marker,
  focus,
  onPick,
}: {
  label: string;
  shapes?: MapShape[];
  draft?: LatLng[];
  marker?: LatLng | null;
  /** عند تغيّره تنتقل الخريطة إليه. */
  focus?: LatLng | null;
  onPick?: (point: LatLng) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const lib = useRef<typeof import("leaflet") | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import("leaflet").then((mod) => {
      const L = (mod as { default?: typeof import("leaflet") }).default ?? mod;
      if (!alive || !box.current || map.current) return;
      lib.current = L;
      // بلا تكبير بالنقر المزدوج: كل نقرة أثناء الرسم تضيف نقطة.
      const m = L.map(box.current, { doubleClickZoom: false }).setView(
        defaultCenter,
        11,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.on("click", (e) => pick.current?.([e.latlng.lat, e.latlng.lng]));
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const L = lib.current,
      group = layer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const shape of shapes) {
      const polygon = L.polygon(shape.points, {
        color: shape.color,
        weight: 2,
        fillOpacity: 0.2,
      }).addTo(group);
      if (shape.label) polygon.bindTooltip(shape.label);
    }
    if (draft.length) {
      L.polyline(draft, {
        color: "#9c2f1e",
        weight: 2,
        dashArray: "6",
      }).addTo(group);
      for (const p of draft)
        L.circleMarker(p, {
          radius: 5,
          color: "#9c2f1e",
          fillOpacity: 1,
        }).addTo(group);
    }
    if (marker)
      L.circleMarker(marker, {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#008069",
        fillOpacity: 1,
      }).addTo(group);
  }, [ready, shapes, draft, marker]);
  useEffect(() => {
    if (ready && focus)
      map.current?.setView(focus, Math.max(map.current.getZoom(), 14));
  }, [ready, focus]);
  // دبوس على كل منطقة محفوظة عند أول عرض.
  const fitted = useRef(false);
  useEffect(() => {
    const L = lib.current;
    if (!ready || !L || fitted.current || !shapes.length) return;
    fitted.current = true;
    map.current?.fitBounds(L.latLngBounds(shapes.flatMap((s) => s.points)), {
      padding: [20, 20],
    });
  }, [ready, shapes]);
  return (
    <div
      ref={box}
      dir="ltr"
      className="map-view"
      role="application"
      aria-label={label}
      data-ready={ready}
    />
  );
}

/** موقع الجهاز الحالي (بإذن المستخدم). */
export function currentLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("المتصفح لا يدعم تحديد الموقع"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () =>
        reject(
          new Error("تعذر الوصول لموقعك؛ اضغط على الخريطة لتحديده يدويًا"),
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
