"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, useSession } from "@/components/forms/shared";
import { can } from "@/lib/permissions";

const POLL_MS = 60_000;
const SEEN = "jdatna:approvals-seen";
export const APPROVALS_CHANGED = "jdatna:approvals-changed";

/**
 * تنبيه المدير ومن له صلاحية الأسر: «أسرة تنتظر الاعتماد» أسفل الشاشة في كل الصفحات،
 * ويعود كلما زاد العدد عما رآه. يُخفى داخل الإدارة لأن التبويب يعرض العدد.
 */
export function ApprovalAlert() {
  const { user } = useSession();
  const pathname = usePathname();
  const allowed = can(user, "producers");
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState(0);

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await api<{ count: number }>("/api/admin/producers/pending");
      setCount(r.count);
    } catch {
      // انقطاع مؤقت: نعيد المحاولة في الدورة التالية.
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    try {
      setSeen(Number(sessionStorage.getItem(SEEN)) || 0);
    } catch {}
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(APPROVALS_CHANGED, check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(APPROVALS_CHANGED, check);
    };
  }, [allowed, check]);

  // بعد اعتماد بعضها ينخفض العدد؛ فأي تسجيل جديد بعده يعيد التنبيه.
  useEffect(() => {
    if (count < seen) setSeen(count);
  }, [count, seen]);

  function dismiss() {
    setSeen(count);
    try {
      sessionStorage.setItem(SEEN, String(count));
    } catch {}
  }

  if (!allowed || count === 0 || count <= seen || pathname === "/admin")
    return null;
  return (
    <aside className="approval-alert" role="status" aria-live="polite">
      <p>
        <strong>
          {count > 1
            ? `${count} أسر منتجة تنتظر الاعتماد`
            : "أسرة منتجة تنتظر الاعتماد"}
        </strong>
      </p>
      <div className="approval-alert-actions">
        <Link
          href="/admin?tab=approvals"
          className="button small"
          onClick={dismiss}
        >
          فتح اعتماد الأسر
        </Link>
        <button type="button" className="button light small" onClick={dismiss}>
          لاحقًا
        </button>
      </div>
    </aside>
  );
}
