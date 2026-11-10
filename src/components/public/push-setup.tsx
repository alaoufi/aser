"use client";
import { useEffect, useState } from "react";
import { api, useSession } from "@/components/forms/shared";

const LATER = "jdatna:push-later";

function base64ToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
const supported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const isIos = () =>
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** يربط هذا الجهاز بإشعارات الحساب الحالي. */
async function subscribe() {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api<{ publicKey: string }>("/api/push/key");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(publicKey),
    });
  }
  await api("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub.toJSON()),
  });
}

/** عند الخروج: يوقف إشعارات الحساب على هذا الجهاز. */
export async function stopPushOnLogout() {
  try {
    if (!supported()) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api("/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  } catch {
    // الخروج يكمل حتى لو تعذر الإلغاء.
  }
}

type Texts = {
  title: string;
  body: string;
  enable: string;
  later: string;
  ios: string;
};

/**
 * تثبيت الموقع كتطبيق وإشعارات الجوال: يسجل عامل الخدمة لكل زائر، ويعرض للمسجّل
 * شريط «فعّل الإشعارات» حتى تصله الرسائل والطلبات الجديدة والموقع مغلق.
 */
export function PushSetup({ texts }: { texts: Texts }) {
  const { user } = useSession();
  const [show, setShow] = useState<"" | "ask" | "ios">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator)
      registration().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setShow("");
      return;
    }
    let later = false;
    try {
      later = Boolean(sessionStorage.getItem(LATER));
    } catch {}
    if (!supported()) {
      // الآيفون: الإشعارات تعمل بعد إضافة الموقع للشاشة الرئيسية.
      setShow(isIos() && !installed() && !later ? "ios" : "");
      return;
    }
    if (Notification.permission === "granted") {
      // الجهاز مأذون: نحدّث ربطه بالحساب الحالي بصمت.
      subscribe().catch(() => {});
      setShow("");
      return;
    }
    setShow(Notification.permission === "default" && !later ? "ask" : "");
  }, [user?.id]);

  if (!show) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem(LATER, "1");
    } catch {}
    setShow("");
  };
  return (
    <aside className="push-bar" aria-label={texts.title}>
      <span className="push-bar-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="push-bar-text">
        <strong>{texts.title}</strong>
        <span>{show === "ios" ? texts.ios : texts.body}</span>
        {error && <span role="alert">{error}</span>}
      </div>
      <div className="push-bar-actions">
        {show === "ask" && (
          <button
            type="button"
            className="button small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                  await subscribe();
                  setShow("");
                } else dismiss();
              } catch {
                setError("تعذر تفعيل الإشعارات على هذا المتصفح.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {texts.enable}
          </button>
        )}
        <button type="button" className="button small light" onClick={dismiss}>
          {texts.later}
        </button>
      </div>
    </aside>
  );
}
