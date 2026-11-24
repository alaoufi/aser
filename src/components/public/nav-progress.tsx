"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * شريط تقدم أعلى الصفحة يظهر فور الضغط على رابط داخلي ويختفي حين تتغير الصفحة (مراجعة السرعة 2026-11-24).
 * كان الزائر يضغط فلا يتحرك شيء حتى يرد الخادم (نصف ثانية إلى ثانية ونصف).
 * لم يُستعمل loading.tsx في الجذر: يجعل الصفحة غير الموجودة ترد 200 بدل 404 والتحويلات 200 بدل 307.
 */
function Bar() {
  const path = usePathname();
  const query = useSearchParams()?.toString() ?? "";
  const [busy, setBusy] = useState(false);
  // تغيّرت الصفحة: انتهى التنقل.
  // biome-ignore lint/correctness/useExhaustiveDependencies: الإخفاء عند تغيّر المسار أو الاستعلام
  useEffect(() => setBusy(false), [path, query]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // مرحلة الالتقاط: روابط Next تمنع الافتراضي في معالجها، فلا يُعتمد على defaultPrevented.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      // نفس الصفحة (أو مرساة فيها): لا تنقل.
      if (to.pathname === location.pathname && to.search === location.search)
        return;
      setBusy(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  // احتياط: لا يبقى الشريط إن أُلغي التنقل.
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => setBusy(false), 10_000);
    return () => window.clearTimeout(t);
  }, [busy]);
  return busy ? (
    <div className="nav-progress" role="status" aria-label="جارٍ فتح الصفحة" />
  ) : null;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
