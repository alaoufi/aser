"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/forms/shared";
import type { MenuLayout } from "@/lib/admin-nav";

/**
 * ترتيب القائمة المحفوظ («ترتيب القوائم»): يُطلب مرة للصفحة، ويتحدّث فورًا في القائمة الجانبية بعد الحفظ.
 * undefined = لم يُحمَّل بعد، null = الترتيب الأصلي.
 */
let cached: MenuLayout | null | undefined;
let inflight: Promise<MenuLayout | null> | null = null;
const listeners = new Set<(l: MenuLayout | null) => void>();

export function loadMenuLayout(force = false): Promise<MenuLayout | null> {
  if (cached !== undefined && !force) return Promise.resolve(cached);
  if (!inflight || force)
    inflight = api<{ layout: MenuLayout | null }>("/api/admin/menu-layout")
      .then((d) => {
        cached = d.layout ?? null;
        for (const fn of listeners) fn(cached);
        return cached;
      })
      .catch(() => {
        // تعذّر التحميل: تبقى القائمة بترتيبها الأصلي.
        cached = null;
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  return inflight;
}
export function setMenuLayoutCache(layout: MenuLayout | null) {
  cached = layout;
  for (const fn of listeners) fn(cached);
}
export function useMenuLayout(enabled = true) {
  const [layout, setLayout] = useState<MenuLayout | null>(cached ?? null);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setLayout);
    loadMenuLayout().then(setLayout);
    return () => {
      listeners.delete(setLayout);
    };
  }, [enabled]);
  return layout;
}
