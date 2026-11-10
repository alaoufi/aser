"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { regionOf } from "@/lib/region-of";
import { visitorLocation } from "@/lib/visitor-location";

/** الاختيار اليدوي يبقى لهذه الزيارة فقط؛ الدخول التالي يعود للتحديد التلقائي. */
const MANUAL = "jdatna:region-manual";
const AUTO = "jdatna:region-auto";
const year = 60 * 60 * 24 * 365;
function session(key: string, value?: string) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    sessionStorage.setItem(key, value);
  } catch {
    // التخزين اختياري.
  }
  return null;
}

/**
 * منطقة «مائدة اليوم»: تُعرف تلقائيًا من موقع الزائر في كل دخول،
 * والقائمة للتعديل اليدوي.
 */
export function RegionPicker({
  regions,
  value,
  path,
  autoLabel = "حسب موقعك",
  detectingLabel = "نحدد منطقتك…",
}: {
  regions: { id: string; name: string }[];
  value: string;
  path: string;
  autoLabel?: string;
  detectingLabel?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "detecting" | "auto">("idle");
  const go = (region: string) => {
    document.cookie = `jdatna_region=${encodeURIComponent(region)}; path=/; max-age=${year}; samesite=lax`;
    router.replace(
      region ? `${path}?region=${encodeURIComponent(region)}` : path,
      { scroll: false },
    );
    router.refresh();
  };
  useEffect(() => {
    if (session(MANUAL)) return;
    const done = session(AUTO);
    if (done) {
      if (done === value) setState("auto");
      return;
    }
    let active = true;
    setState("detecting");
    visitorLocation().then((p) => {
      if (!active) return;
      const region = p ? regionOf(p) : null;
      if (!region || !regions.some((r) => r.id === region)) {
        setState("idle");
        return;
      }
      session(AUTO, region);
      setState("auto");
      if (region !== value) go(region);
    });
    return () => {
      active = false;
    };
    // يُحدَّد مرة في كل دخول فقط.
  }, []);
  return (
    <div className="table-region-wrap">
      <label className="table-region">
        <span className="sr-only">منطقة المائدة</span>
        <select
          aria-label="منطقة المائدة"
          value={value}
          onChange={(e) => {
            session(MANUAL, "1");
            setState("idle");
            go(e.target.value);
          }}
        >
          <option value="">كل المناطق</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {state !== "idle" && (detectingLabel || autoLabel) && (
        <small className="table-region-note" aria-live="polite">
          {state === "detecting" ? detectingLabel : autoLabel}
        </small>
      )}
    </div>
  );
}
