"use client";
import { useEffect, useState } from "react";
import type { FamilyState } from "@/lib/family-status";
import s from "./account.module.css";
import { api, dropWarm, knownSession, loadSession, warmApi } from "./shared";

export const FAMILY_STATUS_CHANGED = "jdatna:family-status";
const steps: FamilyState["key"][] = [
  "incomplete",
  "review",
  "active",
  "trusted",
];

// طلب واحد مشترك لكل مكونات الصفحة (الترويسة، القائمة، الشريط)، ويُعاد عند تغيّر الحالة.
let shared: Promise<FamilyState | null> | null = null;
const STATUS_URL = "/api/producer/status";
// القراءة نفسها يستعملها زر المشاركة في لوحة الأسرة، فتُطلب مرة واحدة.
function readState() {
  warmApi(STATUS_URL);
  return api<{ state: FamilyState | null }>(STATUS_URL).then(
    (x) => x.state,
    () => null,
  );
}
function fetchState(force = false) {
  if (force) dropWarm(STATUS_URL);
  if (!shared || force)
    // الزوار والعملاء لا يطلبون حالة الأسرة المنتجة أصلًا: نتحقق من دور الجلسة أولًا.
    // عند تغيّر الحالة (مثل التسجيل كأسرة) يُطلب دور الجلسة من جديد لا من الذاكرة.
    // الدور المعروف في الجهاز يكفي لبدء الطلب فورًا؛ بلا جلسة معروفة، أو عند تغيّر الحالة، يُسأل الخادم.
    shared = (
      !force && knownSession()
        ? Promise.resolve(knownSession() as { user: { role?: string } | null })
        : loadSession(force)
    )
      .catch(() => ({ user: null }))
      .then((d: { user: { role?: string } | null }) =>
        d.user?.role === "producer" ? readState() : null,
      )
      .catch(() => null);
  return shared;
}
export function useFamilyState() {
  const [state, setState] = useState<FamilyState | null>(null);
  useEffect(() => {
    let active = true;
    const apply = (force: boolean) =>
      fetchState(force).then((v) => {
        if (active) setState(v);
      });
    apply(false);
    const refresh = () => apply(true);
    window.addEventListener(FAMILY_STATUS_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(FAMILY_STATUS_CHANGED, refresh);
    };
  }, []);
  return state;
}

/** شارة حالة الحساب المختصرة: في الترويسة (حيث يتسع) وأعلى قائمة الجوال. */
export function FamilyStatusChip({ place }: { place: "header" | "menu" }) {
  const state = useFamilyState();
  if (!state) return null;
  return (
    <a
      href="/dashboard"
      className={`family-chip family-chip-${state.key} family-chip-${place}`}
      title={state.detail}
    >
      <span className="family-chip-dot" aria-hidden="true" />
      حالة الحساب: <strong>{state.label}</strong>
    </a>
  );
}

/** شريط حالة الحساب المفصّل (الشرح والمراحل وملاحظة الإدارة) — في لوحة الأسرة المنتجة والتسجيل. */
export function FamilyStatusBanner() {
  const state = useFamilyState();
  if (!state) return null;
  const reached = steps.indexOf(state.key);
  return (
    <section
      className={`${s.familyStatus} ${s["familyStatus_" + state.key] ?? ""}`}
      aria-label="حالة حساب الأسرة المنتجة"
    >
      <p className={s.familyStatusHead}>
        حالة الحساب: <strong>{state.label}</strong>
      </p>
      {state.congrats && (
        <p className={s.familyStatusCongrats}>{state.congrats}</p>
      )}
      <p>{state.detail}</p>
      {state.reason && (
        <p className={s.familyStatusReason}>ملاحظة الإدارة: {state.reason}</p>
      )}
      {reached >= 0 && (
        <ol
          className={`${s.stepper} ${s.stepper4}`}
          aria-label="مراحل اعتماد الأسرة المنتجة"
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
