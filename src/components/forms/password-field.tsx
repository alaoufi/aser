"use client";
import { useId, useState } from "react";
import s from "./account.module.css";

/**
 * حقل كلمة مرور مع زر «إظهار/إخفاء» داخل الحقل.
 * العنوان مربوط بالحقل وحده (htmlFor)، فيبقى اسمه كما هو لقارئ الشاشة.
 */
export function PasswordField({
  label,
  hint,
  className = s.field,
  ...input
}: {
  label: string;
  hint?: React.ReactNode;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = input.id ?? auto;
  const [shown, setShown] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className={s.passwordWrap}>
        <input
          dir="ltr"
          maxLength={128}
          {...input}
          id={id}
          type={shown ? "text" : "password"}
        />
        <button
          type="button"
          className={s.passwordToggle}
          aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? "إخفاء" : "إظهار"}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}
