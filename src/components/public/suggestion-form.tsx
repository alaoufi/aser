"use client";
import { useState } from "react";
import { api, useSession } from "@/components/forms/session";

/** نموذج الاقتراح: للزائر والعضو. الاسم ووسيلة التواصل اختياريان للزائر. */
export function SuggestionForm() {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api("/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          body: f.get("body"),
          ...(user
            ? {}
            : {
                name: String(f.get("name") ?? ""),
                contact: String(f.get("contact") ?? ""),
              }),
        }),
      });
      form.reset();
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="suggestion-form" onSubmit={submit}>
      <label>
        اقتراحك
        <textarea
          name="body"
          required
          minLength={5}
          maxLength={2000}
          rows={5}
          onChange={() => setSent(false)}
        />
      </label>
      {!user && (
        <>
          <label>
            اسمك (اختياري)
            <input name="name" maxLength={120} autoComplete="name" />
          </label>
          <label>
            جوالك أو بريدك للرد (اختياري)
            <input name="contact" maxLength={120} dir="ltr" />
          </label>
        </>
      )}
      <button className="button" disabled={busy}>
        {busy ? "جارٍ الإرسال…" : "إرسال الاقتراح"}
      </button>
      <div aria-live="polite">
        {sent && (
          <p role="status" className="suggestion-sent">
            شكرًا لك، وصل اقتراحك للإدارة ✓
          </p>
        )}
        {error && (
          <p role="alert" className="suggestion-error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
