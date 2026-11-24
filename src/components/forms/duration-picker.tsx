"use client";
import { useEffect, useId, useState } from "react";
import { s } from "./shared";

/**
 * مدة صلاحية العرض أو الإعلان (طلب المالك 2026-11-23): «دائم»، أو عدد ساعات من البداية،
 * أو تاريخ محدد. ينتهي العرض فيختفي، وتبقى إحصائياته.
 *
 * يعيد تاريخ النهاية ISO، أو null للدائم. وإن أُعطي `name` يكتبه في خانة مخفية للنماذج غير المتحكَّم بها.
 */
type Mode = "forever" | "hours" | "until";
const HOUR = 3_600_000;
const toLocal = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";

export function DurationPicker({
  start,
  value,
  onChange,
  name,
  label = "مدة الصلاحية",
  allowForever = true,
}: {
  /** بداية العرض ISO؛ null = يبدأ الآن. */
  start: string | null;
  /** تاريخ النهاية الحالي ISO؛ null = دائم. */
  value: string | null;
  onChange?: (endsAt: string | null) => void;
  name?: string;
  label?: string;
  allowForever?: boolean;
}) {
  const id = useId();
  // «الآن» يُثبَّت عند فتح النموذج: حسابه في كل رسم كان يغيّر النهاية كل مرة فيعيد الرسم بلا توقف
  // حين تكون البداية فارغة (حلقة تجمّد الصفحة على الجوالات البطيئة، مراجعة 2026-11-24).
  const [opened] = useState(() => Date.now());
  const base = () => (start ? Date.parse(start) : opened);
  const initialHours = () => {
    if (!value) return 24;
    const h = Math.round((Date.parse(value) - base()) / HOUR);
    return h > 0 ? h : 24;
  };
  const [mode, setMode] = useState<Mode>(() => {
    if (!value) return allowForever ? "forever" : "hours";
    // بلا بداية محددة لا تُحسب الساعات من «الآن» عند فتح المحفوظ، فيبقى تاريخه كما هو.
    if (!start) return "until";
    const h = (Date.parse(value) - base()) / HOUR;
    return h > 0 && Math.abs(h - Math.round(h)) < 0.001 ? "hours" : "until";
  });
  const [hours, setHours] = useState<number>(initialHours);
  const [until, setUntil] = useState<string>(value ?? "");

  const computed =
    mode === "forever"
      ? null
      : mode === "hours"
        ? hours > 0
          ? new Date(base() + hours * HOUR).toISOString()
          : null
        : until || null;

  // البداية تتغير (أو الساعات) فتُحسب النهاية من جديد.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onChange من الأب يتغير مع كل رسم
  useEffect(() => {
    if (computed !== value) onChange?.(computed);
  }, [computed]);

  return (
    <fieldset className={`${s.field} duration-picker`}>
      <legend>{label}</legend>
      <div className="duration-modes" role="radiogroup" aria-label={label}>
        {(
          [
            ...(allowForever ? [["forever", "دائم"]] : []),
            ["hours", "بالساعات"],
            ["until", "حتى تاريخ"],
          ] as [Mode, string][]
        ).map(([m, text]) => (
          <label key={m} className="duration-mode">
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {text}
          </label>
        ))}
      </div>
      {mode === "hours" && (
        <label className="duration-hours">
          عدد الساعات
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={8760}
            step={1}
            required
            value={hours || ""}
            onChange={(e) =>
              setHours(Math.min(8760, Math.max(0, Math.floor(+e.target.value))))
            }
          />
        </label>
      )}
      {mode === "until" && (
        <label className="duration-hours">
          ينتهي في
          <input
            type="datetime-local"
            required
            value={toLocal(until || null)}
            onChange={(e) =>
              setUntil(
                e.target.value ? new Date(e.target.value).toISOString() : "",
              )
            }
          />
        </label>
      )}
      <small className={s.muted} aria-live="polite">
        {computed
          ? `ينتهي ${new Date(computed).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short" })}، ثم يختفي وتبقى إحصائياته.`
          : "دائم: يبقى ظاهرًا حتى توقفه."}
      </small>
      {name && <input type="hidden" name={name} value={computed ?? ""} />}
    </fieldset>
  );
}
