"use client";
import { useEffect, useState } from "react";
import { SAVED_EVENT } from "@/components/forms/shared";

/** رسالة «✓ تم الحفظ» تظهر أسفل الشاشة بعد كل حفظ ناجح في أي مكان بالموقع. */
export function SaveToast() {
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = (e: Event) => {
      setText((e as CustomEvent<string>).detail || "تم الحفظ");
      setTick((t) => t + 1);
    };
    window.addEventListener(SAVED_EVENT, on);
    return () => window.removeEventListener(SAVED_EVENT, on);
  }, []);
  useEffect(() => {
    if (!text) return;
    const timer = window.setTimeout(() => setText(""), 2600);
    return () => window.clearTimeout(timer);
  }, [text, tick]);
  return (
    <div className="save-toast-region" role="status" aria-live="polite">
      {text && (
        <p key={tick} className="save-toast">
          <span aria-hidden="true">✓</span> {text}
        </p>
      )}
    </div>
  );
}
