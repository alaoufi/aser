"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import t from "./folder-tabs.module.css";

export type FolderTab = { id: string; label: string; href?: string };

/**
 * تبويبات ثلاثية الأبعاد متقاربة كأوراق ملف: التبويب المختار يتقدم للأمام، ومحتواه
 * ينفتح من أعلى بحركة طيّ. نوعان:
 * - روابط صفحات (href): شريط تنقل، والصفحة الحالية مميزة (لوحة الأسرة).
 * - تبويبات داخل الصفحة (onSelect): tablist/tab/tabpanel مع الأسهم (معلوماتي).
 */
export function FolderTabs({
  label,
  tabs,
  active,
  onSelect,
  children,
}: {
  label: string;
  tabs: FolderTab[];
  active: string;
  onSelect?: (id: string) => void;
  children: React.ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const routed = !onSelect;
  // على الجوال قد يكون التبويب المختار خارج الشريط: يُمرَّر إليه أفقيًا فقط.
  useEffect(() => {
    const strip = list.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!strip || !tab) return;
    const a = strip.getBoundingClientRect();
    const b = tab.getBoundingClientRect();
    if (b.left < a.left || b.right > a.right)
      strip.scrollBy({
        left: b.left + b.width / 2 - (a.left + a.width / 2),
        behavior: "smooth",
      });
  }, [active]);
  const move = (e: React.KeyboardEvent, index: number) => {
    // في الواجهة العربية: السهم الأيسر للتبويب التالي، والأيمن للسابق.
    const step =
      e.key === "ArrowLeft"
        ? 1
        : e.key === "ArrowRight"
          ? -1
          : e.key === "Home"
            ? -index
            : e.key === "End"
              ? tabs.length - 1 - index
              : 0;
    if (!step || !onSelect) return;
    e.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onSelect(next.id);
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)
        ?.focus(),
    );
  };
  const strip = tabs.map((tab, i) => {
    const on = tab.id === active;
    const cls = `${t.tab} ${on ? t.active : ""}`;
    const style = { zIndex: on ? tabs.length + 1 : tabs.length - i };
    return routed ? (
      <Link
        key={tab.id}
        href={tab.href ?? "#"}
        className={cls}
        style={style}
        aria-current={on ? "page" : undefined}
        data-tab={tab.id}
      >
        <span>{tab.label}</span>
      </Link>
    ) : (
      <button
        key={tab.id}
        type="button"
        role="tab"
        id={`tab-${tab.id}`}
        aria-selected={on}
        aria-controls={`panel-${tab.id}`}
        tabIndex={on ? 0 : -1}
        className={cls}
        style={style}
        data-tab={tab.id}
        onClick={() => onSelect?.(tab.id)}
        onKeyDown={(e) => move(e, i)}
      >
        <span>{tab.label}</span>
      </button>
    );
  });
  return (
    <div className={t.folder}>
      {routed ? (
        <nav aria-label={label} className={t.strip} ref={list}>
          {strip}
        </nav>
      ) : (
        <div role="tablist" aria-label={label} className={t.strip} ref={list}>
          {strip}
        </div>
      )}
      <div
        key={active}
        className={t.panel}
        {...(routed
          ? {}
          : {
              role: "tabpanel",
              id: `panel-${active}`,
              "aria-labelledby": `tab-${active}`,
              tabIndex: 0,
            })}
      >
        {children}
      </div>
    </div>
  );
}
