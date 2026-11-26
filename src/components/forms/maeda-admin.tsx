"use client";
import { useEffect, useState } from "react";
import { maedaAxes, maedaOptionKey, type MaedaAxis } from "@/lib/maeda";
import type { SiteTextKey } from "@/lib/site-texts";
import { Message, api, s, useSiteTexts } from "./shared";

type Data = { hidden: string[]; used: Record<string, number> };

/**
 * الإدارة ← «قالب الموقع» ← «خيارات المائدة»: إظهار كل خيار من «صانع المائدة» للأسر أو إخفاؤه،
 * مع عدد الأسر التي تستعمله. المخفي يُرجع موائد مستعمليه إلى السدو، والأسماء من «نصوص الموقع».
 */
export function MaedaAdmin() {
  const { tx } = useSiteTexts();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Data>("/api/admin/maeda")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  async function toggle(key: string) {
    if (!data) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const hidden = data.hidden.includes(key)
      ? data.hidden.filter((k) => k !== key)
      : [...data.hidden, key];
    try {
      setData(
        await api<Data>("/api/admin/maeda", {
          method: "PUT",
          body: JSON.stringify({ hidden }),
        }),
      );
      setSuccess(tx("maeda.adminSaved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const groups: { axis: MaedaAxis | "runner"; values: readonly string[] }[] = [
    ...maedaAxes,
    { axis: "runner", values: ["on"] },
  ];
  return (
    <section aria-labelledby="maeda-admin" className={`${s.card} ${s.form}`}>
      <h3 id="maeda-admin">{tx("maeda.adminTitle")}</h3>
      <p className={s.muted}>{tx("maeda.adminHint")}</p>
      <Message error={error} success={success} />
      {data &&
        groups.map(({ axis, values }) => (
          <fieldset key={axis}>
            <legend>{tx(`maeda.axis.${axis}` as SiteTextKey)}</legend>
            {values.map((v) => {
              const key = maedaOptionKey(axis, v);
              const used = data.used[key] ?? 0;
              return (
                <label key={key} className={s.field}>
                  <span>
                    <input
                      type="checkbox"
                      checked={!data.hidden.includes(key)}
                      disabled={busy}
                      onChange={() => toggle(key)}
                    />{" "}
                    <strong>
                      {tx(
                        (axis === "runner"
                          ? "maeda.runner.on"
                          : `maeda.${axis}.${v}`) as SiteTextKey,
                      )}
                    </strong>{" "}
                    {tx("maeda.adminShown")}
                  </span>
                  {used > 0 && (
                    <small>{tx("maeda.adminUsed", { count: used })}</small>
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
    </section>
  );
}
