"use client";
import { useEffect, useState } from "react";
import { brandPalettes, brandStyle } from "@/lib/brand";
import { api, Message, s } from "./shared";

type Brand = {
  producerId: string;
  palette: string;
  chosen: boolean;
  tier: "free" | "pro";
};

/** هوية الأسرة: لون يميّز بطاقتها، وتأخذه كل منتجاتها. */
export function BrandCard({ name }: { name: string }) {
  const [brand, setBrand] = useState<Brand | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Brand>("/api/producer/brand")
      .then(setBrand)
      .catch(() => setFailed(true));
  }, []);
  async function choose(palette: string) {
    if (!brand) return;
    const before = brand;
    setBrand({ ...brand, palette });
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      setBrand(
        await api<Brand>("/api/producer/brand", {
          method: "PUT",
          body: JSON.stringify({ palette }),
        }),
      );
      setSuccess("تم الحفظ ✓ وصارت بطاقتك وبطاقات منتجاتك بهذا اللون.");
    } catch (e) {
      setBrand(before);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (failed) return null;
  return (
    <section className={s.card} aria-label="هوية الأسرة">
      <h2>هوية الأسرة</h2>
      <p className={s.muted}>
        اختر لونًا يميّز أسرتك. يظهر في بطاقتك وصفحتك، وتأخذه كل منتجاتك لتُعرف
        بها.
      </p>
      <Message error={error} success={success} />
      {brand && (
        <>
          <fieldset className={s.brandChoices} disabled={busy}>
            <legend className="sr-only">لون الهوية</legend>
            {brandPalettes.map((p) => (
              <label
                key={p.id}
                className={s.brandSwatch}
                style={brandStyle("", p.id)}
              >
                <input
                  type="radio"
                  name="palette"
                  value={p.id}
                  checked={brand.palette === p.id}
                  onChange={() => choose(p.id)}
                />
                <span className={s.brandDot} aria-hidden="true" />
                {p.name}
              </label>
            ))}
          </fieldset>
          <div
            className={`${s.brandPreview} branded`}
            style={brandStyle(brand.producerId, brand.palette)}
            aria-label="معاينة بطاقتك"
            role="img"
          >
            <span className={s.brandPreviewMark} aria-hidden="true">
              {name.trim().slice(0, 1)}
            </span>
            <strong>{name}</strong>
          </div>
          <p className={s.muted}>
            قريبًا: هويات احترافية بشعار وخطوط وألوان خاصة بأسرتك.
          </p>
        </>
      )}
    </section>
  );
}
