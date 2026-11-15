"use client";
import { useEffect, useRef } from "react";
import s from "./account.module.css";

export type FormIssue = { label: string; reason: string; target?: string };

/** اسم الحقل كما يراه المستخدم: من عنوانه، لا من اسمه البرمجي. */
function fieldLabel(el: HTMLElement) {
  const explicit =
    el.getAttribute("data-label") || el.getAttribute("aria-label");
  if (explicit) return explicit.trim();
  const label = (el as HTMLInputElement).labels?.[0];
  if (label) {
    // نص العنوان فقط: دون الحقول وخياراتها والتلميحات الصغيرة داخل الوسم.
    const copy = label.cloneNode(true) as HTMLElement;
    for (const n of Array.from(
      copy.querySelectorAll("select,input,textarea,small,option,button"),
    ))
      n.remove();
    const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  const fieldset = el.closest("fieldset")?.querySelector("legend");
  return (fieldset?.textContent ?? "حقل").trim();
}

function reasonOf(el: HTMLInputElement) {
  const v = el.validity;
  // سبب مخصص للحقل (مثل خانة التعهد: «يلزم الإقرار»).
  if (el.dataset.reason) return el.dataset.reason;
  if (v.valueMissing)
    return el.type === "checkbox" || el.type === "radio"
      ? "اختر واحدًا على الأقل"
      : el.tagName === "SELECT"
        ? "لم يُختر بعد"
        : "مطلوب";
  if (v.tooShort) return `قصير؛ ${el.minLength} أحرف على الأقل`;
  if (v.patternMismatch)
    return el.maxLength > 0 && el.minLength === el.maxLength
      ? `يجب أن يكون ${el.maxLength} أرقام`
      : "الصيغة غير صحيحة";
  if (v.typeMismatch) return "الصيغة غير صحيحة";
  if (v.rangeUnderflow || v.rangeOverflow) return "خارج الحد المسموح";
  return el.validationMessage || "غير مكتمل";
}

/** يجمع النواقص من النموذج كله (الحقول المطلوبة والصيغ)، بأسماء واضحة. */
export function collectIssues(form: HTMLFormElement): FormIssue[] {
  const seen = new Set<string>();
  const issues: FormIssue[] = [];
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!("validity" in el) || el.disabled || el.validity.valid) continue;
    const label = fieldLabel(el);
    if (seen.has(label)) continue;
    seen.add(label);
    if (!el.id) el.id = "fi-" + Math.random().toString(36).slice(2, 9);
    el.setAttribute("aria-invalid", "true");
    el.addEventListener("input", () => el.removeAttribute("aria-invalid"), {
      once: true,
    });
    issues.push({ label, reason: reasonOf(el), target: el.id });
  }
  return issues;
}

/** رسالة النواقص: قائمة واضحة، والضغط على أي بند ينقل إلى حقله. */
export function FormIssues({ issues }: { issues: FormIssue[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (issues.length) ref.current?.focus();
  }, [issues]);
  if (!issues.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={s.issues}>
      <strong>
        بقي {issues.length === 1 ? "شيء واحد" : `${issues.length} أشياء`} قبل
        الإرسال:
      </strong>
      <ul>
        {issues.map((i) => (
          <li key={i.label}>
            {i.target ? (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(i.target!);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.focus({ preventScroll: true });
                }}
              >
                {i.label}
              </button>
            ) : (
              <span>{i.label}</span>
            )}
            : {i.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
