"use client";
import { useState } from "react";
import { api } from "@/components/forms/session";

export function UnsubscribeForm({
  token,
  texts,
}: {
  token: string;
  texts: { button: string; done: string; invalid: string };
}) {
  const [state, setState] = useState<"idle" | "done" | "invalid">(
    token ? "idle" : "invalid",
  );
  const [busy, setBusy] = useState(false);
  if (state === "done") return <p role="status">{texts.done}</p>;
  if (state === "invalid") return <p role="alert">{texts.invalid}</p>;
  return (
    <button
      type="button"
      className="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ unsubscribed: boolean }>(
            "/api/alerts/unsubscribe",
            { method: "POST", body: JSON.stringify({ token }), saved: false },
          );
          setState(r.unsubscribed ? "done" : "invalid");
        } catch {
          setState("invalid");
        } finally {
          setBusy(false);
        }
      }}
    >
      {texts.button}
    </button>
  );
}
