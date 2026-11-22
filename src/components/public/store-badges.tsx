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
  // شارتا المتجرين بشكلهما الرسمي (شعار Apple وشعار Google Play الملوّن)، بلا عنوان فوقهما (طلب المالك).
  // النص المقروء لقارئ الشاشة والاختبارات من «نصوص الموقع» بالعربية.
  return (
    <div className="store-badges" data-testid="store-badges">
      <div className="store-badges-row">
        {playStore && (
          <a
            className="store-badge"
            href={playStore}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={texts.googlePlay}
            dir="ltr"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path
                fill="#2196F3"
                d="M3.6 2.2C3.3 2.4 3.1 2.8 3.1 3.3v17.4c0 .5.2.9.5 1.1L13.5 12z"
              />
              <path
                fill="#4CAF50"
                d="M3.6 2.2 13.5 12l3.1-3.1L5.2 2.4c-.6-.4-1.2-.4-1.6-.2z"
              />
              <path
                fill="#FFC107"
                d="M16.6 8.9 13.5 12l3.1 3.1 3.7-2.1c1-.6 1-1.4 0-2z"
              />
              <path
                fill="#F44336"
                d="M3.6 21.8c.4.2 1 .2 1.6-.2l11.4-6.5-3.1-3.1z"
              />
            </svg>
            <span className="store-badge-text">
              <small>GET IT ON</small>
              <strong>Google Play</strong>
            </span>
          </a>
        )}
        {appStore && (
          <a
            className="store-badge"
            href={appStore}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={texts.appStore}
            dir="ltr"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.9-1.1-2.9-4.2zM13.9 5.4c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"
              />
            </svg>
            <span className="store-badge-text">
              <small>Download on the</small>
              <strong>App Store</strong>
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
