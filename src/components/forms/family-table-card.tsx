"use client";
import { useEffect, useState } from "react";
import {
  finishColors,
  samePreset,
  tableCount,
  tableDimensionKeys,
  tableDimensions,
  tablePresetIds,
  tablePresets,
  type FamilyTableDesign,
  type TableFinish,
} from "@/lib/family-table";
import type { SiteTextKey } from "@/lib/site-texts";
import { FamilyTable, type TableDish } from "@/components/public/family-table";
import { useTx } from "@/components/site-texts";
import { api, Message, s } from "./shared";

type Own = {
  name: string;
  chosen: boolean;
  table: FamilyTableDesign;
  welcome: string;
  dishes: TableDish[];
};
const fmt = (n: number) => new Intl.NumberFormat("ar-SA").format(n);

/**
 * مائدة الأسرة (طلب المالك 2026-11-26): تختار الأسرة من مكتبة الموائد شكلًا وارتفاعًا ولونًا
 * وزخرفة وإطارًا وطريقة عرض، أو مقترحًا جاهزًا، وترى المعاينة بأطباقها قبل الحفظ.
 */
export function FamilyTableCard() {
  const { tx, txb } = useTx();
  const [own, setOwn] = useState<Own | null>(null);
  const [draft, setDraft] = useState<FamilyTableDesign | null>(null);
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Own>("/api/producer/table")
      .then((o) => {
        setOwn(o);
        setDraft(o.table);
        setWelcome(o.welcome);
      })
      .catch(() => setFailed(true));
  }, []);
  if (failed) return null;
  const set = (patch: Partial<FamilyTableDesign>) => {
    setSuccess("");
    setError("");
    setDraft((d) => d && { ...d, ...patch });
  };
  function surprise() {
    const any = <T,>(l: readonly T[]) =>
      l[Math.floor(Math.random() * l.length)];
    set(
      Object.fromEntries(
        tableDimensionKeys.map((k) => [k, any(tableDimensions[k])]),
      ) as FamilyTableDesign,
    );
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const o = await api<Own>("/api/producer/table", {
        method: "PUT",
        body: JSON.stringify({ ...draft, welcome }),
      });
      setOwn(o);
      setDraft(o.table);
      setWelcome(o.welcome);
      setSuccess(tx("ftable.pick.saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sample: TableDish[] = Array.from({ length: 4 }, (_, i) => ({
    id: "sample-" + i,
    name: tx("ftable.pick.sample"),
  }));
  const changed =
    own && draft && (!samePreset(own.table, draft) || welcome !== own.welcome);
  return (
    <section
      className={s.card}
      aria-labelledby="family-table-pick-title"
      id="family-table"
    >
      <h2 id="family-table-pick-title">{txb("ftable.pick.title")}</h2>
      <p className={s.muted}>
        {tx("ftable.pick.intro", { count: fmt(tableCount) })}
      </p>
      <Message error={error} success={success} />
      {own && draft && (
        <>
          <div className={s.ftPreview}>
            <FamilyTable
              design={draft}
              dishes={own.dishes.length ? own.dishes : sample}
              welcome={welcome.trim() || tx("ftable.welcome")}
              empty={tx("ftable.empty")}
              label={tx("ftable.pick.preview")}
              link={false}
            />
          </div>
          <label className={s.field}>
            {txb("ftable.pick.welcome")}
            <input
              type="text"
              maxLength={40}
              value={welcome}
              placeholder={tx("ftable.welcome")}
              disabled={busy}
              aria-describedby="ftable-welcome-hint"
              onChange={(e) => {
                setSuccess("");
                setError("");
                setWelcome(e.target.value);
              }}
            />
            <small id="ftable-welcome-hint" className={s.muted}>
              {tx("ftable.pick.welcomeHint", {
                text: tx("ftable.welcome"),
              })}
            </small>
          </label>
          <fieldset className={s.ftChoices} disabled={busy}>
            <legend>{txb("ftable.pick.presets")}</legend>
            <div className={s.ftChips}>
              {tablePresetIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={s.ftChip}
                  aria-pressed={samePreset(draft, tablePresets[id])}
                  onClick={() => set(tablePresets[id])}
                >
                  {txb(`ftable.preset.${id}` as SiteTextKey)}
                </button>
              ))}
            </div>
          </fieldset>
          {tableDimensionKeys.map((dim) => (
            <fieldset key={dim} className={s.ftChoices} disabled={busy}>
              <legend>{txb(`ftable.dim.${dim}` as SiteTextKey)}</legend>
              <div className={s.ftChips}>
                {tableDimensions[dim].map((opt) => (
                  <label key={opt} className={s.ftChip}>
                    <input
                      type="radio"
                      name={"ftable-" + dim}
                      value={opt}
                      checked={draft[dim] === opt}
                      onChange={() => set({ [dim]: opt })}
                    />
                    {dim === "finish" && (
                      <span
                        className={s.ftSwatch}
                        style={{
                          background: `linear-gradient(135deg,${finishColors[opt as TableFinish][0]} 50%,${finishColors[opt as TableFinish][1]} 50%)`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    {txb(`ftable.opt.${dim}.${opt}` as SiteTextKey)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className={s.actions}>
            <button
              type="button"
              className={s.button}
              disabled={busy || !(changed || !own.chosen)}
              onClick={save}
            >
              {txb("ftable.pick.save")}
            </button>
            <button
              type="button"
              className={s.buttonSecondary}
              disabled={busy}
              onClick={surprise}
            >
              {txb("ftable.pick.surprise")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
