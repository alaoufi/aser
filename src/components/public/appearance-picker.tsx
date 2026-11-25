"use client";
import { useEffect, useRef, useState } from "react";

/**
 * «ألوان الموقع» (طلب المالك 2026-11-25): لوحات ألوان تراثية يختارها الزائر، تُحفظ في جهازه
 * وتُطبَّق قبل رسم الصفحة (PALETTE_SCRIPT في layout). «السدو» هي الأصلية.
 */
export const PALETTES = [
  { key: "sadu", from: "#4f5d36", to: "#9c2f1e" },
  { key: "nakheel", from: "#2f5d3a", to: "#c9a04a" },
  { key: "teen", from: "#8b4a2b", to: "#d39b55" },
  { key: "qahwa", from: "#5b3a29", to: "#5e7a3a" },
  { key: "zafaran", from: "#7a1f2b", to: "#e0a526" },
  { key: "neel", from: "#2c3e66", to: "#a3402a" },
] as const;
export type PaletteKey = (typeof PALETTES)[number]["key"];
export const PALETTE_STORE = "jdatna:palette";
/** يُشغَّل قبل رسم الصفحة: لا وميض بالألوان الأصلية قبل لون الزائر. */
export const PALETTE_SCRIPT = `try{var p=localStorage.getItem("${PALETTE_STORE}");if(p&&p!=="sadu"&&/^[a-z]+$/.test(p))document.documentElement.dataset.palette=p}catch(e){}`;

type Texts = { button: string; title: string; note: string } & Record<
  PaletteKey,
  string
>;

const swatch = (p: (typeof PALETTES)[number]) =>
  `linear-gradient(135deg, ${p.from} 0 50%, ${p.to} 50% 100%)`;

export function AppearancePicker({ texts }: { texts: Texts }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<PaletteKey>("sadu");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const p = document.documentElement.dataset.palette as
      PaletteKey | undefined;
    if (p && PALETTES.some((x) => x.key === p)) setCurrent(p);
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  function choose(key: PaletteKey) {
    setCurrent(key);
    if (key === "sadu") delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = key;
    try {
      localStorage.setItem(PALETTE_STORE, key);
    } catch {
      // التخزين محجوب (تصفح خاص): يبقى اللون لهذه الزيارة.
    }
  }
  const now = PALETTES.find((p) => p.key === current) ?? PALETTES[0];
  return (
    <div className="appearance" ref={box}>
      <button
        type="button"
        className="appearance-button"
        aria-label={texts.button}
        title={texts.button}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="appearance-dot" style={{ background: swatch(now) }} />
      </button>
      {open && (
        <div
          className="appearance-panel"
          role="dialog"
          aria-label={texts.title}
        >
          <strong className="appearance-title">{texts.title}</strong>
          <div className="appearance-swatches">
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                className="appearance-swatch"
                aria-pressed={current === p.key}
                onClick={() => choose(p.key)}
              >
                <span
                  className="appearance-dot"
                  style={{ background: swatch(p) }}
                />
                <span>{texts[p.key]}</span>
              </button>
            ))}
          </div>
          {texts.note && (
            <small className="appearance-note">{texts.note}</small>
          )}
        </div>
      )}
    </div>
  );
}
