"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SiteTextKey } from "@/lib/site-texts";
import { useTx } from "@/components/site-texts";
import { isFamilyAccount, useSession } from "@/components/forms/session";

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

/** أقسام «هوية الأسرة» كما في لوحة الأسرة (/dashboard/identity#القسم). */
const IDENTITY_PARTS = [
  "data",
  "brand",
  "table",
  "location",
  "contact",
] as const;

/**
 * زر الألوان (طلب المالك 2026-11-26): نافذة بتبويبات واضحة: «ألوان الموقع» و«القالب»، وللأسرة
 * «هوية الأسرة» بأقسامها (بيانات الأسرة، الألوان والزخرفة، المائدة، الموقع، ظهور التواصل).
 */
export function AppearancePicker({
  texts,
  template,
}: {
  texts: Texts;
  template: "classic" | "najdi";
}) {
  const { tx, txb } = useTx();
  const router = useRouter();
  const { user } = useSession();
  const family = isFamilyAccount(user);
  const [tab, setTab] = useState<"palette" | "template" | "identity">(
    "palette",
  );
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
  const pickTemplate = (t: "classic" | "najdi") => {
    document.cookie = `jdatna_template=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  const tabs = [
    ["palette", texts.title],
    ["template", txb("appearance.tab.template")],
    ...(family ? [["identity", txb("fidentity.title")]] : []),
  ] as [typeof tab, string][];
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
          aria-label={txb("appearance.title")}
        >
          <strong className="appearance-title">
            {txb("appearance.title")}
          </strong>
          <div
            className="appearance-tabs"
            role="tablist"
            aria-label={txb("appearance.title")}
          >
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`appearance-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="appearance-tabpanel"
                className="appearance-tab"
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="appearance-tabpanel"
            role="tabpanel"
            aria-labelledby={`appearance-tab-${tab}`}
          >
            {tab === "palette" && (
              <>
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
              </>
            )}
            {tab === "template" && (
              <div className="appearance-templates">
                {(["classic", "najdi"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="appearance-swatch"
                    aria-pressed={template === t}
                    onClick={() => pickTemplate(t)}
                  >
                    <span
                      className={`appearance-template-mark is-${t}`}
                      aria-hidden="true"
                    />
                    <span>
                      {txb(`appearance.template.${t}` as SiteTextKey)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {tab === "identity" && family && (
              <ul className="appearance-identity">
                {IDENTITY_PARTS.map((part) => (
                  <li key={part}>
                    <Link
                      href={`/dashboard/identity${part === "data" ? "" : `#${part}`}`}
                      onClick={() => setOpen(false)}
                    >
                      <strong>
                        {txb(`fidentity.tab.${part}` as SiteTextKey)}
                      </strong>
                      <small>
                        {tx(`appearance.hint.${part}` as SiteTextKey)}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
