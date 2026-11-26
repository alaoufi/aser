"use client";
import { useState } from "react";
import { s } from "./shared";

/** يزيل التشكيل والتطويل والمسافات الزائدة، فتُقبل «عميل» مكتوبة بأي شكل. */
export const normalizeWord = (v: string) =>
  v
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * تأكيد بالكتابة (قرار المالك 2026-11-26): قبل القرار المهم يكتب المستخدم كلمة التأكيد
 * (مثل «عميل» أو «متأكد»)، ولا يعمل زر التأكيد حتى يطابقها.
 */
export function TypedConfirm({
  word,
  prompt,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  word: string;
  /** نص الخانة، مثل: اكتب «عميل» للتأكيد. */
  prompt: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = normalizeWord(typed) === normalizeWord(word);
  return (
    <div className={s.form}>
      <label className={s.field}>
        {prompt}
        <input
          value={typed}
          autoComplete="off"
          autoFocus
          maxLength={40}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ok && !busy) {
              e.preventDefault();
              onConfirm();
            }
          }}
        />
      </label>
      <div className={s.actions}>
        <button
          type="button"
          className={s.danger}
          disabled={busy || !ok}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className={s.buttonSecondary} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
