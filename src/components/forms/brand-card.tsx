"use client";
import { useEffect, useState } from "react";
import {
  brandEffects,
  brandPalettes,
  brandPatterns,
  brandScales,
  identityCount,
  identityProps,
  patternUrl,
} from "@/lib/brand";
import { api, Message, s } from "./shared";

type Brand = {
  producerId: string;
  palette: string;
  pattern: string;
  effect: string;
  scale: number;
  chosen: boolean;
  tier: "free" | "pro";
};
type Choice = Pick<Brand, "palette" | "pattern" | "effect" | "scale">;

const fmt = (n: number) => new Intl.NumberFormat("ar-SA").format(n);

/**
 * هوية الأسرة من مكتبة الهويات: لون + زخرفة + تأثير + حجم.
 * تظهر في خلفية بطاقة الأسرة وشكلها، وتأخذها كل منتجاتها داخل إطار قسمها.
 * المكتبة المميزة مقفلة للهوية الاحترافية المدفوعة (قريبًا).
 */
export function BrandCard({ name }: { name: string }) {
  const [brand, setBrand] = useState<Brand | null>(null),
    [draft, setDraft] = useState<Choice | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Brand>("/api/producer/brand")
      .then((b) => {
        setBrand(b);
        setDraft(b);
      })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return null;
  const pro = brand?.tier === "pro";
  const set = (patch: Partial<Choice>) => {
    setSuccess("");
    setDraft((d) => d && { ...d, ...patch });
  };
  const lock = (premium?: boolean) => Boolean(premium) && !pro;
  function surprise() {
    const free = <T extends { premium?: boolean }>(l: T[]) =>
      l.filter((x) => !x.premium || pro);
    const any = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
    set({
      palette: any(free(brandPalettes)).id,
      pattern: any(free(brandPatterns)).id,
      effect: any(free(brandEffects)).id,
      scale: any(brandScales).id,
    });
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const b = await api<Brand>("/api/producer/brand", {
        method: "PUT",
        body: JSON.stringify({
          palette: draft.palette,
          pattern: draft.pattern,
          effect: draft.effect,
          scale: draft.scale,
        }),
      });
      setBrand(b);
      setDraft(b);
      setSuccess("تم حفظ هويتك ✓ وصارت بطاقتك وبطاقات منتجاتك بها.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const preview = draft && brand && identityProps(brand.producerId, draft);
  const accent = brandPalettes.find((p) => p.id === draft?.palette)?.accent;
  return (
    <section className={s.card} aria-label="هوية الأسرة">
      <h2>هوية الأسرة</h2>
      <p className={s.muted}>
        اختر من مكتبة الهويات ({fmt(identityCount.family)} هوية للأسرة، و
        {fmt(identityCount.product)} هوية للمنتجات مع إطارات الأقسام). تظهر
        هويتك في بطاقتك وصفحتك، وتأخذها كل منتجاتك داخل إطار قسمها.
      </p>
      <Message error={error} success={success} />
      {draft && brand && preview && (
        <>
          <div className={s.brandPreviewRow}>
            <div
              className={`${s.brandPreview} ${preview.className}`}
              style={preview.style}
              aria-label="معاينة بطاقة الأسرة"
              role="img"
            >
              <span className={s.brandPreviewMark} aria-hidden="true">
                {name.trim().slice(0, 1)}
              </span>
              <strong>{name}</strong>
            </div>
            <div
              className={`${s.brandPreview} ${s.brandPreviewProduct} ${identityProps(brand.producerId, draft, { chosen: "corners" }).className}`}
              style={preview.style}
              aria-label="معاينة بطاقة منتج"
              role="img"
            >
              <strong>طبق من أطباقك</strong>
              <small>داخل إطار قسمه</small>
            </div>
          </div>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>اللون</legend>
            {brandPalettes.map((p) => (
              <label
                key={p.id}
                className={s.brandSwatch}
                style={
                  identityProps("", { palette: p.id, pattern: "plain" }).style
                }
              >
                <input
                  type="radio"
                  name="palette"
                  checked={draft.palette === p.id}
                  disabled={lock(p.premium)}
                  onChange={() => set({ palette: p.id })}
                />
                <span className={s.brandDot} aria-hidden="true" />
                {p.name}
                {p.premium && <Premium />}
              </label>
            ))}
          </fieldset>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>الزخرفة (الشكل)</legend>
            {brandPatterns.map((p) => (
              <label key={p.id} className={s.patternSwatch}>
                <input
                  type="radio"
                  name="pattern"
                  checked={draft.pattern === p.id}
                  disabled={lock(p.premium)}
                  onChange={() => set({ pattern: p.id })}
                />
                <span
                  className={s.patternTile}
                  aria-hidden="true"
                  style={{
                    backgroundImage: patternUrl(
                      p.id,
                      accent ?? "#4f5d36",
                      0.55,
                    ),
                  }}
                />
                {p.name}
                {p.premium && <Premium />}
              </label>
            ))}
          </fieldset>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>التأثير</legend>
            {brandEffects.map((p) => (
              <label key={p.id} className={s.optionChip}>
                <input
                  type="radio"
                  name="effect"
                  checked={draft.effect === p.id}
                  disabled={lock(p.premium)}
                  onChange={() => set({ effect: p.id })}
                />{" "}
                {p.name}
                {p.premium && <Premium />}
              </label>
            ))}
          </fieldset>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>حجم الزخرفة</legend>
            {brandScales.map((p) => (
              <label key={p.id} className={s.optionChip}>
                <input
                  type="radio"
                  name="scale"
                  checked={draft.scale === p.id}
                  onChange={() => set({ scale: p.id })}
                />{" "}
                {p.name}
              </label>
            ))}
          </fieldset>

          <div className={s.actions}>
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={save}
            >
              {busy ? "جارٍ الحفظ…" : "حفظ الهوية"}
            </button>
            <button
              type="button"
              className={s.buttonSecondary}
              onClick={surprise}
            >
              اقترح لي هوية
            </button>
          </div>
          {!pro && (
            <p className={s.muted}>
              🔒 «مميزة»: من المكتبة المميزة للهوية الاحترافية، وتتاح قريبًا
              مدفوعة.
            </p>
          )}
        </>
      )}
    </section>
  );
}
function Premium() {
  return <span className={s.premiumTag}>🔒 مميزة</span>;
}
