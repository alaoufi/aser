"use client";
import { useEffect, useState } from "react";

const SOURCE = "jdatna:store-source";

/**
 * داخل تطبيقي الجوال لا تظهر أزرار المتجرين: فتحهما يكون بـ ?source=ios (الآيفون) أو
 * ?source=app (أندرويد)، ويُحفظ للجلسة. Apple لا تقبل إشارة لمنصة أخرى داخل التطبيق (2.3.10).
 */
function insideApp() {
  try {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    const source = new URLSearchParams(window.location.search).get("source");
    if (source === "ios" || source === "app")
      sessionStorage.setItem(SOURCE, source);
    return Boolean(sessionStorage.getItem(SOURCE));
  } catch {
    return false;
  }
}

/** أزرار تحميل التطبيق أسفل الموقع؛ كل زر يظهر بعد أن يفعّله المالك من «الإدارة ← تطبيق الجوال». */
export function StoreBadges({
  appStore,
  playStore,
  texts,
}: {
  appStore: string | null;
  playStore: string | null;
  texts: { title: string; appStore: string; googlePlay: string };
}) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!insideApp()), []);
  if (!show || (!appStore && !playStore)) return null;
  return (
    <div className="store-badges" data-testid="store-badges">
      <h3>{texts.title}</h3>
      <div className="store-badges-row">
        {appStore && (
          <a
            className="store-badge"
            href={appStore}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.9-1.1-2.9-4.2zM13.9 5.4c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"
              />
            </svg>
            <span>{texts.appStore}</span>
          </a>
        )}
        {playStore && (
          <a
            className="store-badge"
            href={playStore}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 2.6c-.3.2-.4.6-.4 1v16.8c0 .4.1.8.4 1l9.4-9.4zm10.4 10.4-2.3 2.3 2.9 2.9 3.6-2c.9-.5.9-1.3 0-1.8zm-1-1 2.4-2.4-10.6-6c-.3-.2-.7-.2-1-.1zm0 2 -9.2 8.5c.3.1.7.1 1-.1l10.6-6z"
              />
            </svg>
            <span>{texts.googlePlay}</span>
          </a>
        )}
      </div>
    </div>
  );
}
