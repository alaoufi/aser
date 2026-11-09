"use client";
import { useEffect, useState } from "react";
import type { FamilyState } from "@/lib/family-status";
import s from "./account.module.css";

export const FAMILY_STATUS_CHANGED = "jdatna:family-status";
const steps: FamilyState["key"][] = [
  "incomplete",
  "review",
  "active",
  "trusted",
];

/** شريط حالة حساب الأسرة أعلى صفحات الحساب؛ لا يظهر لمن ليس له ملف أسرة. */
export function FamilyStatusBanner() {
  const [state, setState] = useState<FamilyState | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/producer/status")
        .then((r) => (r.ok ? r.json() : { state: null }))
        .then((d: { state: FamilyState | null }) => {
          if (active) setState(d.state);
        })
        .catch(() => {});
    load();
    window.addEventListener(FAMILY_STATUS_CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(FAMILY_STATUS_CHANGED, load);
    };
  }, []);
  if (!state) return null;
  const reached = steps.indexOf(state.key);
  return (
    <section
      className={`${s.familyStatus} ${s["familyStatus_" + state.key] ?? ""}`}
      aria-label="حالة حساب الأسرة"
    >
      <p className={s.familyStatusHead}>
        حالة الحساب: <strong>{state.label}</strong>
      </p>
      <p>{state.detail}</p>
      {state.reason && (
        <p className={s.familyStatusReason}>ملاحظة الإدارة: {state.reason}</p>
      )}
      {reached >= 0 && (
        <ol
          className={`${s.stepper} ${s.stepper4}`}
          aria-label="مراحل اعتماد الأسرة"
        >
          {[
            ["incomplete", "إكمال المطلوب"],
            ["review", "تحت المراجعة"],
            ["active", "نشط"],
            ["trusted", "موثوق"],
          ].map(([key, label], i) => (
            <li
              key={key}
              className={i <= reached ? s.stepDone : undefined}
              aria-current={i === reached ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
