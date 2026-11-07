"use client";
import { useState } from "react";
export function ShareButton({ title }: { title: string }) {
  const [message, setMessage] = useState("");
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href });
        setMessage("");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setMessage("تم نسخ رابط الصفحة");
      } else {
        setMessage("يمكنك نسخ الرابط من شريط العنوان");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage("تعذّرت المشاركة؛ يمكنك نسخ الرابط من شريط العنوان");
    }
  }
  return (
    <div className="share-control">
      <button className="button secondary" onClick={share}>
        مشاركة الصفحة ↗
      </button>
      <span role="status" aria-live="polite" className="muted">
        {message}
      </span>
    </div>
  );
}
