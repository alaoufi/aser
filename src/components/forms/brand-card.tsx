"use client";
import { useEffect, useState } from "react";
import {
  arrangements,
  brandEffects,
  brandPalettes,
  brandScales,
  hueFamilies,
  identityCount,
  identityProps,
  motifs,
  parsePattern,
  patternId,
  patternUrl,
  rotations,
  weights,
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
  taken: { palette: string; motif: string }[];
};
type Choice = Pick<Brand, "palette" | "pattern" | "effect" | "scale">;

const fmt = (n: number) => new Intl.NumberFormat("ar-SA").format(n);
const free = brandPalettes.filter((p) => !p.premium);
const premiumPalettes = brandPalettes.filter((p) => p.premium);
const familyOf = (palette: string) =>
  palette.startsWith("c") ? Number(palette.slice(1).split("-")[0]) : -1;

/**
 * هوية الأسرة من مكتبة الهويات: لون من مئات التدرجات، وزخرفة من مئات الأشكال،
 * وتأثير خفيف وحجم. تظهر في خلفية بطاقة الأسرة وشكلها، وتأخذها كل منتجاتها داخل برواز قسمها.
 * لا تتطابق هويتان (نفس اللون ونفس الزخرفة) في نفس المدينة. المميز مقفل للهوية الاحترافية.
 */
export function BrandCard({ name }: { name: string }) {
  const [brand, setBrand] = useState<Brand | null>(null),
    [draft, setDraft] = useState<Choice | null>(null),
    [hue, setHue] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Brand>("/api/producer/brand")
      .then((b) => {
        setBrand(b);
        setDraft(b);
        setHue(Math.max(0, familyOf(b.palette)));
      })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return null;
  const pro = brand?.tier === "pro";
  const set = (patch: Partial<Choice>) => {
    setSuccess("");
    setError("");
    setDraft((d) => d && { ...d, ...patch });
  };
  const parts = draft
    ? draft.pattern === "plain"
      ? { motif: "plain", arr: "g", weight: "2", rot: "0" }
      : parsePattern(draft.pattern)
    : null;
  const setPattern = (p: Partial<NonNullable<typeof parts>>) =>
    parts &&
    set({
      pattern: patternId(
        p.motif ?? parts.motif,
        p.arr ?? parts.arr,
        p.weight ?? parts.weight,
        p.rot ?? parts.rot,
      ),
    });
  const isTaken = (palette: string, motif: string) =>
    motif !== "plain" &&
    Boolean(
      brand?.taken.some((t) => t.palette === palette && t.motif === motif),
    );
  function surprise() {
    if (!brand) return;
    const any = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
    for (let i = 0; i < 50; i++) {
      const palette = any(pro ? brandPalettes : free).id;
      const motif = any(motifs.filter((m) => pro || !m.premium)).id;
      if (isTaken(palette, motif)) continue;
      const fam = familyOf(palette);
      if (fam >= 0) setHue(fam);
      set({
        palette,
        pattern: patternId(
          motif,
          any(arrangements).id,
          any(weights).id,
          any(rotations).id,
        ),
        effect: any(brandEffects.filter((e) => pro || !e.premium)).id,
        scale: any(brandScales).id,
      });
      return;
    }
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
  const productPreview =
    draft &&
    brand &&
    identityProps(brand.producerId, draft, { chosen: "scallop-2" });
  const accent =
    brandPalettes.find((p) => p.id === draft?.palette)?.accent ?? "#4f5d36";
  const tones = free.filter((p) => familyOf(p.id) === hue);
  return (
    <section className={s.card} aria-label="هوية الأسرة">
      <h2>هوية الأسرة</h2>
      <p className={s.muted}>
        مكتبة الهويات: {fmt(identityCount.palettes)} لونًا وتدرجًا، و
        {fmt(identityCount.patterns)} زخرفة، فتكون {fmt(identityCount.family)}{" "}
        هوية للأسر. تظهر هويتك في بطاقتك وصفحتك، وتأخذها منتجاتك داخل برواز
        قسمها. ولتتميز، لا تتكرر نفس الزخرفة بنفس اللون لأسرتين في مدينة واحدة.
      </p>
      <Message error={error} success={success} />
      {draft && brand && parts && preview && productPreview && (
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
              className={`${s.brandPreview} ${s.brandPreviewProduct} ${productPreview.className}`}
              style={productPreview.style}
              aria-label="معاينة بطاقة منتج"
              role="img"
            >
              <strong>طبق من أطباقك</strong>
              <small>داخل برواز قسمه</small>
            </div>
          </div>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>اللون</legend>
            <div
              className={s.hueRow}
              role="radiogroup"
              aria-label="عائلة اللون"
            >
              {hueFamilies.map((f, i) => (
                <button
                  key={f.name}
                  type="button"
                  role="radio"
                  aria-checked={hue === i}
                  title={f.name}
                  aria-label={f.name}
                  className={s.hueDot}
                  style={{ background: free[i * 12 + 7].accent }}
                  onClick={() => setHue(i)}
                />
              ))}
            </div>
            {tones.map((p) => (
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
                  onChange={() => set({ palette: p.id })}
                />
                <span className={s.brandDot} aria-hidden="true" />
                {p.name}
              </label>
            ))}
          </fieldset>
          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>ألوان متدرجة (المكتبة المميزة)</legend>
            {premiumPalettes.map((p) => (
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
                  disabled={!pro}
                  onChange={() => set({ palette: p.id })}
                />
                <span className={s.brandDot} aria-hidden="true" />
                {p.name}
                <Premium />
              </label>
            ))}
          </fieldset>

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>الزخرفة (شكل الخلفية)</legend>
            <label className={s.patternSwatch}>
              <input
                type="radio"
                name="motif"
                checked={parts.motif === "plain"}
                onChange={() => setPattern({ motif: "plain" })}
              />
              <span className={s.patternTile} aria-hidden="true" />
              سادة
            </label>
            {motifs.map((m) => {
              const taken = isTaken(draft.palette, m.id);
              return (
                <label key={m.id} className={s.patternSwatch}>
                  <input
                    type="radio"
                    name="motif"
                    checked={parts.motif === m.id}
                    disabled={(m.premium && !pro) || taken}
                    onChange={() => setPattern({ motif: m.id })}
                  />
                  <span
                    className={s.patternTile}
                    aria-hidden="true"
                    style={{
                      backgroundImage: patternUrl(
                        patternId(m.id, parts.arr, parts.weight, parts.rot),
                        accent,
                        0.6,
                      ),
                    }}
                  />
                  {m.name}
                  {m.premium && <Premium />}
                  {taken && (
                    <span className={s.takenTag}>مستخدمة في مدينتك</span>
                  )}
                </label>
              );
            })}
          </fieldset>
          {parts.motif !== "plain" && (
            <div className={s.brandOptions}>
              <Options
                legend="الترتيب"
                name="arr"
                items={arrangements}
                value={parts.arr}
                onChange={(arr) => setPattern({ arr })}
              />
              <Options
                legend="سماكة الخط"
                name="weight"
                items={weights}
                value={parts.weight}
                onChange={(weight) => setPattern({ weight })}
              />
              <Options
                legend="الاتجاه"
                name="rot"
                items={rotations}
                value={parts.rot}
                onChange={(rot) => setPattern({ rot })}
              />
            </div>
          )}

          <fieldset className={s.brandChoices} disabled={busy}>
            <legend>التأثير</legend>
            {brandEffects.map((p) => (
              <label key={p.id} className={s.optionChip}>
                <input
                  type="radio"
                  name="effect"
                  checked={draft.effect === p.id}
                  disabled={p.premium && !pro}
                  onChange={() => set({ effect: p.id })}
                />{" "}
                {p.name}
                {p.premium && <Premium />}
              </label>
            ))}
          </fieldset>
          <Options
            legend="حجم الزخرفة"
            name="scale"
            items={brandScales.map((x) => ({ id: String(x.id), name: x.name }))}
            value={String(draft.scale)}
            onChange={(v) => set({ scale: Number(v) })}
          />

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
function Options({
  legend,
  name,
  items,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  items: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className={s.brandChoices}>
      <legend>{legend}</legend>
      {items.map((x) => (
        <label key={x.id} className={s.optionChip}>
          <input
            type="radio"
            name={name}
            checked={value === x.id}
            onChange={() => onChange(x.id)}
          />{" "}
          {x.name}
        </label>
      ))}
    </fieldset>
  );
}
function Premium() {
  return <span className={s.premiumTag}>🔒 مميزة</span>;
}
