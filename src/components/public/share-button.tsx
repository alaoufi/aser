"use client";
import { useState } from "react";

/**
 * مشاركة الصفحة: الرابط المختصر ظاهرًا، ونسخه، وواتساب مباشرة، وقائمة الجوال للتطبيقات الأخرى
 * (تيك توك وسناب وإنستغرام وغيرها؛ لا روابط ويب لنشرها مباشرة، فتمر عبر قائمة المشاركة).
 */
export function ShareButton({
  title,
  url,
  text,
  label = "مشاركة الصفحة",
}: {
  title: string;
  /** الرابط المختصر؛ بدونه يُشارك رابط الصفحة الحالية. */
  url?: string | null;
  /** نص الرسالة قبل الرابط (واتساب وقائمة المشاركة). */
  text?: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  const link = () => url || window.location.href;
  const body = text ?? title;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link());
      setMessage("تم نسخ الرابط ✓ الصقه في تيك توك أو أي مكان");
    } catch {
      setMessage("اضغط مطولًا على الرابط لنسخه");
    }
  }
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: body, url: link() });
        setMessage("");
      } else await copy();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        await copy();
    }
  }
  return (
    <div className="share-control">
      <strong className="share-title">{label}</strong>
      {url && (
        <bdi dir="ltr" className="share-link">
          {url.replace(/^https:\/\//, "")}
        </bdi>
      )}
      <div className="share-actions">
        <button type="button" className="button secondary" onClick={copy}>
          نسخ الرابط
        </button>
        <a
          className="button secondary share-whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(`${body}\n${url ?? ""}`)}`}
          onClick={(e) => {
            // بلا رابط مختصر: رابط الصفحة الحالية وقت الضغط.
            if (!url)
              e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(`${body}\n${link()}`)}`;
          }}
          target="_blank"
          rel="noopener noreferrer"
        >
          واتساب
        </a>
        <button type="button" className="button secondary" onClick={share}>
          تيك توك وتطبيقات أخرى ↗
        </button>
      </div>
      <span role="status" aria-live="polite" className="muted">
        {message}
      </span>
    </div>
  );
}
