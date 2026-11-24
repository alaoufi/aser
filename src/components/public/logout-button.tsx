"use client";
import { useState } from "react";
import { api, useSession } from "@/components/forms/session";
import { stopPushOnLogout } from "./push-setup";

/** «خروج»: يظهر للمسجّل فقط، ويُخرجه من هذا الجهاز ثم يعيده للرئيسية. */
export function LogoutButton({ className }: { className?: string }) {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <button
      type="button"
      className={className ?? "logout-link"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await stopPushOnLogout();
          await api("/api/logout", { method: "POST" });
          window.location.assign("/");
        } catch {
          setBusy(false);
          window.alert("تعذر تسجيل الخروج. حاول مجددًا.");
        }
      }}
    >
      {busy ? "جارٍ الخروج…" : "خروج"}
    </button>
  );
}
