"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/forms/shared";

const SEEN = "jdatna:family-welcome";

/**
 * ترحيب الأسرة المنتجة في كل زيارة للموقع (مرة لكل زيارة/تبويب، حتى مع
 * بقاء الدخول محفوظًا)، مع اختصارات لما تضيفه اليوم.
 */
export function FamilyWelcome() {
  const { user } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (user?.role !== "producer") return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
      sessionStorage.setItem(SEEN, "1");
    } catch {
      // بلا تخزين الجلسة: يظهر مرة في هذه الصفحة.
    }
    if (!seen) setOpen(true);
  }, [user?.id, user?.role]);
  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal?.();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  if (!open) return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: النقر خارج البطاقة يغلقها، ولوحة المفاتيح تغلقها بـ Escape عبر onCancel وزر الإغلاق.
    <dialog
      ref={dialog}
      className="family-welcome"
      aria-labelledby="family-welcome-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="family-welcome-card">
        <button
          type="button"
          className="family-welcome-close"
          aria-label="إغلاق الترحيب"
          onClick={close}
        >
          ×
        </button>
        <span className="family-welcome-mark" aria-hidden="true">
          ✦
        </span>
        <h2 id="family-welcome-title">مرحبا بك جيت ومعك الخير</h2>
        <p>وش جبت معك اليوم؟</p>
        <nav aria-label="اختصارات الأسرة" className="family-welcome-links">
          <Link href="/dashboard/products" onClick={close}>
            <strong>إضافة منتجاتك</strong>
            <small>طبق جديد أو تحديث المتوفر</small>
          </Link>
          <Link href="/dashboard/library" onClick={close}>
            <strong>مكتبة الصور</strong>
            <small>صور أطباقك جاهزة للمنتجات</small>
          </Link>
          <Link href="/dashboard#family-categories" onClick={close}>
            <strong>الأقسام</strong>
            <small>أقسام منتجاتك</small>
          </Link>
        </nav>
      </div>
    </dialog>
  );
}
