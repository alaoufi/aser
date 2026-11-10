"use client";
import { useEffect, useState } from "react";
import { visitorLocation } from "@/lib/visitor-location";
import type { LatLng } from "@/lib/geo";
import { MapView, currentLocation } from "./map-view";

type Result =
  | { covered: true; hasZones: true; zone: string; fee: number | null }
  | { covered: false; hasZones: boolean };

/** العضو يحدد موقعه على الخريطة ونخبره هل هو ضمن نطاق توصيل الأسرة. */
export function LocationCheck({ producerSlug }: { producerSlug: string }) {
  const [point, setPoint] = useState<LatLng | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // الفحص تلقائي بموقع الزائر في هذه الزيارة؛ الخريطة للتعديل اليدوي.
  useEffect(() => {
    let active = true;
    visitorLocation().then((p) => {
      if (!active || !p) return;
      setFocus(p);
      check(p);
    });
    return () => {
      active = false;
    };
  }, [producerSlug]);
  async function check(p: LatLng) {
    setPoint(p);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/coverage/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producer: producerSlug, lat: p[0], lng: p[1] }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "تعذر فحص الموقع");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="coverage-check" aria-label="هل توصل الأسرة لموقعك؟">
      <h3>هل توصل الأسرة لموقعك؟</h3>
      <p className="muted">
        نفحص موقعك الحالي تلقائيًا، ولتعديله اضغط على الخريطة عند موقعك. لا نحفظ
        موقعك.
      </p>
      <div className="map-tools">
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            currentLocation()
              .then((p) => {
                setFocus(p);
                check(p);
              })
              .catch((e) => setError((e as Error).message))
          }
        >
          استخدم موقعي الحالي
        </button>
      </div>
      <MapView
        label="حدد موقعك على الخريطة"
        marker={point}
        focus={focus}
        onPick={check}
      />
      <div aria-live="polite">
        {busy && <p className="coverage-result unknown">جارٍ الفحص…</p>}
        {error && <p className="coverage-result no">{error}</p>}
        {result?.covered && (
          <p className="coverage-result ok">
            ✓ موقعك ضمن منطقة التوصيل «{result.zone}»
            {result.fee !== null
              ? ` — رسوم التوصيل ${result.fee} ر.س`
              : " — الرسوم بالاتفاق"}
          </p>
        )}
        {result && !result.covered && (
          <p
            className={`coverage-result ${result.hasZones ? "no" : "unknown"}`}
          >
            {result.hasZones
              ? "موقعك خارج مناطق توصيل هذه الأسرة. تواصل معها للتأكد أو اختر الاستلام."
              : "لم تحدد الأسرة مناطق توصيلها على الخريطة بعد؛ تواصل معها للتأكد."}
          </p>
        )}
      </div>
    </section>
  );
}
