"use client";
import { useState } from "react";
import { api } from "./session";

/**
 * زر مشاركة في لوحة الأسرة: يجلب الرابط المختصر، ثم يفتح قائمة المشاركة في الجوال
 * (واتساب وتيك توك وغيرها) أو ينسخه، ويُظهره حتى يُنسخ يدويًا.
 */
export function ShareAction({
  query,
  title,
  text,
  label,
  className,
  buttonText = "مشاركة",
}: {
  buttonText?: string;
  /** product=المعرف أو family=رابط الأسرة */
  query: string;
  title: string;
  text: string;
  label: string;
  className?: string;
}) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  async function share() {
    setMessage("");
    try {
      const url =
        link || (await api<{ url: string }>(`/api/share?${query}`)).url;
      setLink(url);
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
        }
      }
      await navigator.clipboard.writeText(url);
      setMessage("تم نسخ الرابط ✓");
    } catch (error) {
      setMessage((error as Error).message || "اضغط مطولًا على الرابط لنسخه");
    }
  }
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={share}
        aria-label={label}
      >
        {buttonText}
      </button>
      {(link || message) && (
        <small role="status" aria-live="polite">
          {link && (
            <bdi dir="ltr" style={{ userSelect: "all" }}>
              {link.replace(/^https:\/\//, "")}
            </bdi>
          )}{" "}
          {message}
          {link && (
            <>
              {" "}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                واتساب
              </a>
            </>
          )}
        </small>
      )}
    </>
  );
}
