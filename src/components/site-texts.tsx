"use client";
import { createContext, useContext } from "react";
import {
  siteTextDefaults,
  type SiteTextKey,
  type SiteTexts,
} from "@/lib/site-texts";

/**
 * «نصوص الموقع» لكل الصفحات (قرار المالك 2026-11-25/26): القالب يمرر النصوص مرة واحدة،
 * و<T k="المفتاح" /> يكتب النص المعدَّل من الإدارة أو الأصلي، و«» إن أخفته الإدارة.
 * يعمل داخل مكوّنات الخادم والمتصفح معًا. useTx للنصوص داخل الخصائص (aria-label وplaceholder…).
 */
const Ctx = createContext<Partial<SiteTexts> | null>(null);

export function SiteTextsProvider({
  texts,
  children,
}: {
  texts: Partial<SiteTexts>;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={texts}>{children}</Ctx.Provider>;
}

type Vars = Record<string, string | number>;
const fill = (text: string, vars?: Vars) =>
  vars
    ? text.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      )
    : text;

/** النصوص من القالب إن وُجدت؛ null خارج القالب (لوحات قديمة تقرؤها من الخادم). */
export function useSiteTextsContext() {
  return useContext(Ctx);
}

export function useTx() {
  const texts = useContext(Ctx);
  /** النص، و«» إن أخفته الإدارة. */
  const tx = (key: SiteTextKey, vars?: Vars) =>
    fill(texts?.[key] ?? siteTextDefaults[key], vars);
  /** للأزرار والخصائص: لا يُخفى، فيعود للأصل إن حُذف. */
  const txb = (key: SiteTextKey, vars?: Vars) =>
    fill(texts?.[key] || siteTextDefaults[key], vars);
  return { tx, txb };
}

/** نص من «نصوص الموقع» داخل الصفحة. */
export function T({ k, vars }: { k: SiteTextKey; vars?: Vars }) {
  return <>{useTx().tx(k, vars)}</>;
}
