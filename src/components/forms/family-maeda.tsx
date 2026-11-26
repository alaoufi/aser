"use client";
import { useEffect, useState } from "react";
import { MaedaTable } from "@/components/public/maeda-table";
import {
  maedaAxes,
  maedaColors,
  maedaOptionKey,
  maedaPresets,
  maedaStarter,
  sameMaeda,
  usesHidden,
  type MaedaAxis,
  type MaedaColor,
  type MaedaStyle,
} from "@/lib/maeda";
import type { SiteTextKey } from "@/lib/site-texts";
import {
  AccountShell,
  Guard,
  Message,
  api,
  s,
  useSession,
  useSiteTexts,
} from "./shared";
import m from "./family-maeda.module.css";

type Data = { name: string; style: MaedaStyle | null; hidden: string[] };
const SAMPLE = [
  "/food/traditional-platter.jpeg",
  "/food/rice-plate.jpeg",
  "/food/clay-pot.jpeg",
];

/** عيّنة صغيرة من المائدة (المادة واللون والشكل) لأزرار الموائد الجاهزة. */
function Swatch({ style }: { style: MaedaStyle | null }) {
  return (
    <span
      className={`maeda ${m.swatch}`}
      {...(style
        ? {
            "data-shape": style.shape,
            "data-finish": style.finish,
            "data-edge": style.edge === "none" ? undefined : style.edge,
            "data-runner": style.runner ? "on" : undefined,
            style: { "--tc": maedaColors[style.color] } as React.CSSProperties,
          }
        : { "data-cloth": "sadu" })}
      aria-hidden="true"
    >
      <span className="maeda-cloth" />
    </span>
  );
}

/**
 * لوحة الأسرة ← «مائدتي» (اعتماد المالك 2026-11-26): موائد جاهزة أولًا (السدو افتراضيًا)، ثم
 * «ركّب مائدتك بنفسك» بخمسة محاور، ومعاينة حية باسم الأسرة قبل الحفظ. الخيارات المخفية من الإدارة
 * لا تظهر. كل النصوص من «نصوص الموقع».
 */
function FamilyMaeda() {
  const { tx, txb } = useSiteTexts();
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<MaedaStyle | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Data>("/api/producer/maeda")
      .then((d) => {
        setData(d);
        setDraft(d.style);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  if (!data)
    return (
      <>
        <Message error={error} />
        {!error && <p role="status">{tx("maeda.loading")}</p>}
      </>
    );
  const hidden = data.hidden;
  const name = (k: string) => tx(k as SiteTextKey);
  const pick = (axis: MaedaAxis | "runner", value: string | boolean) => {
    setSuccess("");
    setDraft({ ...(draft ?? maedaStarter), [axis]: value } as MaedaStyle);
  };
  async function save() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const d = await api<Data>("/api/producer/maeda", {
        method: "PUT",
        body: JSON.stringify({ style: draft }),
      });
      setData(d);
      setDraft(d.style);
      setSuccess(tx("maeda.saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const presets = maedaPresets.filter(
    (p) => !p.style || !usesHidden(p.style, hidden),
  );
  const current = draft ?? null;
  return (
    <>
      <p className={s.muted}>{tx("maeda.lead")}</p>
      <section aria-labelledby="maeda-preview-label" className={m.preview}>
        <h2 id="maeda-preview-label" className={m.label}>
          {tx("maeda.preview")}
        </h2>
        <MaedaTable
          id="maeda-preview"
          title={tx("family.table")}
          dishes={[]}
          preview={SAMPLE}
          owner={data.name}
          maeda={current}
          empty={{ title: "" }}
        />
      </section>
      <section aria-labelledby="maeda-ready">
        <h2 id="maeda-ready" className={m.label}>
          {tx("maeda.ready")}
        </h2>
        <ul className={m.presets}>
          {presets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={m.preset}
                aria-pressed={sameMaeda(current, p.style)}
                onClick={() => {
                  setSuccess("");
                  setDraft(p.style);
                }}
              >
                <Swatch style={p.style} />
                <span>{name(`maeda.preset.${p.id}`)}</span>
                {sameMaeda(data.style, p.style) && (
                  <small>{tx("maeda.current")}</small>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <details
        className={m.build}
        open={
          Boolean(current) && !presets.some((p) => sameMaeda(p.style, current))
        }
      >
        <summary>{txb("maeda.build")}</summary>
        {maedaAxes.map(({ axis, values }) => (
          <fieldset key={axis} className={m.axis}>
            <legend>{tx(`maeda.axis.${axis}` as SiteTextKey)}</legend>
            <div className={m.options}>
              {values
                .filter((v) => !hidden.includes(maedaOptionKey(axis, v)))
                .map((v) => (
                  <label key={v} className={m.option}>
                    <input
                      type="radio"
                      name={`maeda-${axis}`}
                      checked={(current ?? null)?.[axis] === v}
                      onChange={() => pick(axis, v)}
                    />
                    {axis === "color" && (
                      <span
                        className={m.dot}
                        style={{ background: maedaColors[v as MaedaColor] }}
                        aria-hidden="true"
                      />
                    )}
                    {name(`maeda.${axis}.${v}`)}
                  </label>
                ))}
            </div>
          </fieldset>
        ))}
        {!hidden.includes("runner") && (
          <fieldset className={m.axis}>
            <legend>{tx("maeda.axis.runner")}</legend>
            <div className={m.options}>
              {[true, false].map((on) => (
                <label key={String(on)} className={m.option}>
                  <input
                    type="radio"
                    name="maeda-runner"
                    checked={Boolean(current) && current?.runner === on}
                    onChange={() => pick("runner", on)}
                  />
                  {tx(on ? "maeda.runner.on" : "maeda.runner.off")}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </details>
      <div className={m.actions}>
        <Message error={error} success={success} />
        <button
          type="button"
          className={s.button}
          disabled={busy || sameMaeda(current, data.style)}
          onClick={save}
        >
          {txb("maeda.save")}
        </button>
      </div>
    </>
  );
}

export function FamilyMaedaPage() {
  const session = useSession();
  const { tx } = useSiteTexts();
  return (
    <AccountShell>
      <h1>{tx("maeda.title")}</h1>
      <Guard {...session} />
      {session.user && <FamilyMaeda />}
    </AccountShell>
  );
}
