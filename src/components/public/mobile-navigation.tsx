"use client";
import { T } from "@/components/site-texts";
import Link from "next/link";
import { AccountGreeting, AccountLink, FamilyMenuLinks } from "./account-link";
import { LogoutButton } from "./logout-button";
import { FamilyStatusChip } from "@/components/forms/family-status";
import { useEffect, useRef } from "react";
export function MobileNavigation({
  switcher,
  tools,
}: {
  switcher?: React.ReactNode;
  /** أول القائمة (قرار المالك 2026-11-27): الألوان والقوالب، ومشاركة التطبيق. */
  tools?: React.ReactNode;
}) {
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", closeOnEscape);
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
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated close after a link activates; links handle keyboard themselves */}
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
        {tools && <div className="menu-tools">{tools}</div>}
        <AccountGreeting />
        <FamilyStatusChip place="menu" />
        <Link href="/">
          <T k="c.mobileNav.t1" />
        </Link>
        <Link href="/browse">
          <T k="c.mobileNav.t2" />
        </Link>
        <Link href="/producers">
          <T k="c.mobileNav.t3" />
        </Link>
        <Link href="/offers">
          <T k="c.mobileNav.t4" />
        </Link>
        <Link href="/subscriptions">
          <T k="c.mobileNav.t5" />
        </Link>
        <Link href="/orders">
          <T k="c.mobileNav.t6" />
        </Link>
        <Link href="/messages">
          <T k="c.mobileNav.t7" />
        </Link>
        <Link href="/about">
          <T k="c.mobileNav.t8" />
        </Link>
        <Link href="/guide">
          <T k="c.mobileNav.t9" />
        </Link>
        <Link href="/suggestions">
          <T k="c.mobileNav.t10" />
        </Link>
        {switcher}
        {/* آخر القائمة: «تسجيل الدخول» لغير المسجّل، و«حسابي» ثم «خروج» للمسجّل. */}
        <AccountLink />
        <FamilyMenuLinks />
        <LogoutButton />
      </nav>
    </details>
  );
}
