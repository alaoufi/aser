"use client";
import { useState } from "react";
import { api, Message, s } from "./shared";
export function ProductPhoto({
  id,
  imageUrl,
  onUploaded,
}: {
  id: string;
  imageUrl: string | null;
  onUploaded: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("اختر صورة المنتج.");
      return;
    }
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png"].includes(file.type)
    ) {
      setError("اختر صورة JPEG أو PNG لا تتجاوز 5 ميجابايت.");
      return;
    }
    setBusy(true);
    try {
      await api<{ imageUrl: string }>(
        `/api/producer/products/${encodeURIComponent(id)}/image`,
        { method: "POST", body: f },
      );
      await onUploaded();
      setSuccess("تم حفظ صورة المنتج.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="صورة المنتج المحفوظة"
          width={240}
          height={180}
          loading="lazy"
          style={{ objectFit: "cover", borderRadius: 12, maxWidth: "100%" }}
        />
      )}
      <Message error={error} success={success} />
      <form className={s.form} onSubmit={upload}>
        <label className={s.field}>
          صورة المنتج · JPEG أو PNG حتى 5 ميجابايت
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png"
            required
            disabled={busy}
          />
        </label>
        <button className={s.button} disabled={busy}>
          {busy
            ? "جارٍ رفع الصورة…"
            : imageUrl
              ? "استبدال الصورة"
              : "رفع الصورة"}
        </button>
      </form>
    </div>
  );
}
