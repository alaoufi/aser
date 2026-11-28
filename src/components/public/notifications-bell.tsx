"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSession } from "@/components/forms/session";
import { useTx } from "@/components/site-texts";

type Item = {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  read: boolean;
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", {
    day: "numeric",
    month: "short",
  });
};

/** رقم الإشعارات على أيقونة التطبيق في الجوال (إن دعمه الجهاز)، ويُمسح بقراءتها. */
function appBadge(n: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (n > 0) nav.setAppBadge?.(n)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // اختياري.
  }
}

/**
 * جرس «الإشعارات» في الرأس (قرار المالك 2026-11-27): عدد غير المقروء، وقائمة آخر الإشعارات بروابطها.
 * كل إشعار يصل للجوال يُحفظ هنا، فيجده العضو بعد أن يختفي من شريط الجوال.
 */
export function NotificationsBell() {
  const { user } = useSession();
  const { txb } = useTx();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDetailsElement>(null);
  const load = useCallback(async () => {
    try {
      const d = await api<{ items: Item[]; unread: number }>(
        "/api/notifications",
      );
      setItems(d.items);
      setUnread(d.unread);
      appBadge(d.unread);
    } catch {
      // انقطاع مؤقت.
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    // إشعار وصل والموقع مفتوح: يظهر في الجرس فورًا.
    const onPush = (e: MessageEvent) => {
      if (e.data?.type === "jdatna:push") setTimeout(load, 800);
    };
    navigator.serviceWorker?.addEventListener("message", onPush);
    const outside = (e: PointerEvent) => {
      if (box.current?.open && !box.current.contains(e.target as Node))
        box.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      navigator.serviceWorker?.removeEventListener("message", onPush);
      document.removeEventListener("pointerdown", outside);
    };
  }, [user, load]);
  if (!user) return null;
  const read = async (body: { read: string }) => {
    try {
      const d = await api<{ items: Item[]; unread: number }>(
        "/api/notifications",
        { method: "POST", body: JSON.stringify(body) },
      );
      setItems(d.items);
      setUnread(d.unread);
      appBadge(d.unread);
    } catch {
      // يُعاد في التحميل التالي.
    }
  };
  return (
    <details className="notif-bell" ref={box}>
      <summary
        aria-label={
          unread ? txb("notif.labelCount", { n: unread }) : txb("notif.label")
        }
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="notif-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </summary>
      <div
        className="notif-panel"
        role="dialog"
        aria-label={txb("notif.label")}
      >
        <div className="notif-head">
          <strong>{txb("notif.label")}</strong>
          {unread > 0 && (
            <button type="button" onClick={() => read({ read: "all" })}>
              {txb("notif.readAll")}
            </button>
          )}
        </div>
        {!items.length ? (
          <p className="notif-empty">{txb("notif.empty")}</p>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className={n.read ? "" : "is-unread"}>
                <Link
                  href={n.url}
                  onClick={() => {
                    if (!n.read) read({ read: n.id });
                    if (box.current) box.current.open = false;
                  }}
                >
                  <strong>{n.title}</strong>
                  {n.body && <span>{n.body}</span>}
                  <small>{ago(n.createdAt)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
