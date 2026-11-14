"use client";
import { useState } from "react";
import s from "./account.module.css";

/** رابط خرائط لنص الموقع: الرابط كما هو إن كان https، وإلا بحث بالعنوان. */
export function mapsUrl(location: string) {
  const value = location.trim();
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.toString();
  } catch {}
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(value)
  );
}

/** عرض موقع مع رابط «فتح الموقع في الخرائط». */
export function LocationLink({
  label,
  location,
}: {
  label: string;
  location: string;
}) {
  return (
    <p className={s.locationLine}>
      <strong>{label}:</strong>{" "}
      <span style={{ overflowWrap: "anywhere" }}>{location}</span>{" "}
      <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer">
        فتح الموقع في الخرائط
      </a>
    </p>
  );
}

/** حقل موقع: يكتب العنوان أو يلصق رابط الخرائط، أو يرسل موقعه الحالي بضغطة. */
export function LocationInput({
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [state, setState] = useState("");
  function locate() {
    if (!navigator.geolocation) {
      setState("المتصفح لا يدعم تحديد الموقع؛ اكتب العنوان أو الصق الرابط.");
      return;
    }
    setState("جارٍ تحديد موقعك…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude.toFixed(6),
          lng = p.coords.longitude.toFixed(6);
        setValue(`https://maps.google.com/?q=${lat},${lng}`);
        setState("تم إدخال موقعك الحالي ✓");
      },
      () =>
        setState(
          "تعذر تحديد موقعك؛ اسمح بالوصول للموقع، أو اكتب العنوان أو الصق الرابط.",
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  return (
    <div className={s.field}>
      <label htmlFor={"loc-" + name}>{label}</label>
      <textarea
        id={"loc-" + name}
        name={name}
        rows={2}
        maxLength={1000}
        minLength={required ? 5 : undefined}
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={"loc-hint-" + name}
      />
      <small id={"loc-hint-" + name}>{hint}</small>
      <div className={s.actions}>
        <button type="button" className={s.buttonSecondary} onClick={locate}>
          استخدم موقعي الحالي
        </button>
        {value.trim().length >= 5 && (
          <a href={mapsUrl(value)} target="_blank" rel="noopener noreferrer">
            معاينة في الخرائط
          </a>
        )}
      </div>
      <p role="status" aria-live="polite" className={s.muted}>
        {state}
      </p>
    </div>
  );
}
