"use client";
import Link from "next/link";
import { AccountLink } from "./account-link";
import { useEffect, useRef } from "react";
export function MobileNavigation() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        ref.current
      )
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="mobile-nav" ref={ref}>
      <summary aria-label="قائمة التنقل">
        <svg
          className="menu-open-icon"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <svg
          className="menu-close-icon"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      </summary>
      <nav
        aria-label="التنقل للجوال"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("a") &&
            ref.current
          )
            ref.current.open = false;
        }}
      >
        <Link href="/">الرئيسية</Link>
        <Link href="/browse">اكتشف الأكلات</Link>
        <Link href="/producers">الأسر المنتجة</Link>
        <Link href="/offers">العروض الخاصة</Link>
        <Link href="/orders">طلباتي</Link>
        <Link href="/about">حكايتنا</Link>
        <AccountLink />
      </nav>
    </details>
  );
}
