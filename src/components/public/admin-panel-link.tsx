"use client";
import { useState } from "react";
import { api, useSession } from "@/components/forms/session";

/**
 * «لوحة الإدارة» في قائمة الحساب (مثل «أي خدمة»، AdminPanelLink): دخول واحد، فمن له صلاحيات إدارية
 * يفتح اللوحة بضغطة دون تسجيل دخول جديد. اللوحة بجلسة مستقلة 12 ساعة، والموقع يبقى حسابه الشخصي.
 */
export function AdminPanelLink({ className }: { className?: string }) {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  if (!user?.adminAccess) return null;
  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/auth/admin-session", { method: "POST" });
      window.location.assign("/admin");
    } catch (e) {
      setBusy(false);
      window.alert((e as Error).message);
    }
  }
  return (
    <button
      type="button"
      className={className}
      onClick={open}
      disabled={busy}
      data-testid="open-admin-panel"
    >
      {busy ? "جارٍ الفتح…" : "لوحة الإدارة"}
    </button>
  );
}
