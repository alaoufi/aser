"use client";
import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo";
import { MapView, currentLocation } from "@/components/maps/map-view";
import { api, Message, s } from "./shared";

type Zone = { name: string; fee: number | null; points: LatLng[] };
const colors = ["#008069", "#9c2f1e", "#2f4a6b", "#b5823f", "#4f5d36"];

/** الأسرة ترسم مناطق توصيلها على الخريطة، كما في تطبيقات التوصيل. */
export function ZoneEditor() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    api<{ zones: Zone[] }>("/api/producer/zones")
      .then((d) => setZones(d.zones))
      .catch((e) => {
        setZones([]);
        setError((e as Error).message);
      });
  }, []);
  const change = (i: number, patch: Partial<Zone>) => {
    setSuccess("");
    setZones((z) => z!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  async function save() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/producer/zones", {
        method: "PUT",
        body: JSON.stringify({ zones }),
      });
      setSuccess("تم حفظ مناطق التوصيل على الخريطة.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="مناطق التوصيل على الخريطة" className={s.card}>
      <h2>مناطق التوصيل على الخريطة</h2>
      <p className={s.muted}>
        ارسم حدود المنطقة التي توصل لها: اضغط «ارسم منطقة جديدة» ثم اضغط على
        الخريطة عند كل زاوية من حدودها، وبعدها «أنهِ المنطقة». يرى العميل فقط هل
        موقعه داخل مناطقك، ولا تُعرض الحدود للعامة.
      </p>
      <div className="map-tools">
        {!drawing ? (
          <button
            type="button"
            className={s.button}
            disabled={zones === null || (zones?.length ?? 0) >= 10}
            onClick={() => {
              setDrawing(true);
              setDraft([]);
              setSuccess("");
            }}
          >
            ارسم منطقة جديدة
          </button>
        ) : (
          <>
            <button
              type="button"
              className={s.button}
              disabled={draft.length < 3}
              onClick={() => {
                setZones((z) => [
                  ...(z ?? []),
                  {
                    name: `منطقة ${(z?.length ?? 0) + 1}`,
                    fee: null,
                    points: draft,
                  },
                ]);
                setDraft([]);
                setDrawing(false);
              }}
            >
              أنهِ المنطقة ({draft.length} نقاط)
            </button>
            <button
              type="button"
              className={s.buttonSecondary}
              disabled={!draft.length}
              onClick={() => setDraft((d) => d.slice(0, -1))}
            >
              تراجع عن آخر نقطة
            </button>
            <button
              type="button"
              className={s.buttonSecondary}
              onClick={() => {
                setDraft([]);
                setDrawing(false);
              }}
            >
              إلغاء الرسم
            </button>
          </>
        )}
        <button
          type="button"
          className={s.buttonSecondary}
          onClick={() =>
            currentLocation()
              .then(setFocus)
              .catch((e) => setError((e as Error).message))
          }
        >
          انتقل إلى موقعي
        </button>
      </div>
      <MapView
        label="خريطة مناطق التوصيل"
        shapes={(zones ?? []).map((z, i) => ({
          points: z.points,
          color: colors[i % colors.length],
          label: z.name,
        }))}
        draft={draft}
        focus={focus}
        onPick={drawing ? (p) => setDraft((d) => [...d, p]) : undefined}
      />
      {zones && zones.length > 0 && (
        <ul className={s.list} aria-label="مناطقي">
          {zones.map((z, i) => (
            <li key={`${i}-${z.points.length}`} className={s.grid}>
              <label className={s.field}>
                اسم المنطقة
                <input
                  value={z.name}
                  maxLength={80}
                  onChange={(e) => change(i, { name: e.target.value })}
                />
              </label>
              <label className={s.field}>
                رسوم التوصيل (ريال، اختيارية)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={z.fee ?? ""}
                  onChange={(e) =>
                    change(i, {
                      fee:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className={s.danger}
                onClick={() => {
                  setSuccess("");
                  setZones((all) => all!.filter((_, j) => j !== i));
                }}
              >
                حذف {z.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={s.button}
        disabled={busy || zones === null || drawing}
        onClick={save}
      >
        {busy ? "جارٍ الحفظ…" : "حفظ مناطق التوصيل"}
      </button>
      <Message error={error} success={success} />
    </section>
  );
}
