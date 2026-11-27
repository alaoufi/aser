"use client";
import { chime } from "@/lib/chime";
import { T } from "@/components/site-texts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSession } from "@/components/forms/session";
import { onLive } from "@/components/forms/live";

type Unread = {
  total: number;
  conversations: {
    id: string;
    title: string;
    preview: string | null;
    unread: number;
    lastAt: string;
  }[];
};
const POLL_MS = 60_000;
/** يُبث بعدد غير المقروء ليحدّث شارة «المحادثات» في كل مكان. */
const UNREAD_EVENT = "jdatna:unread";
/** يُطلب به فحص فوري (مثل فتح محادثة وقراءتها). */
export const UNREAD_REFRESH = "jdatna:unread-refresh";
const SEEN_KEY = "jdatna:messages-seen";
let lastTotal = 0;

/** عدد الرسائل غير المقروءة، يتحدث مع كل فحص. */
export function useUnread() {
  const [count, setCount] = useState(lastTotal);
  useEffect(() => {
    const on = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, on);
    return () => window.removeEventListener(UNREAD_EVENT, on);
  }, []);
  return count;
}

/** رابط «المحادثات» بأيقونة وشارة عدد الرسائل الجديدة، أعلى الموقع. */
export function MessagesLink({ className }: { className?: string }) {
  const { user } = useSession();
  const count = useUnread();
  if (!user) return null;
  return (
    <Link
      href="/messages"
      className={`messages-link${count ? " has-unread" : ""}${className ? ` ${className}` : ""}`}
      aria-label={count ? `المحادثات، ${count} رسالة جديدة` : "المحادثات"}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M4 5h16v11H9l-5 4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="messages-link-label">
        <T k="c.msgAlert.t1" />
      </span>
      {count > 0 && (
        <span className="messages-badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

/** بصمة غير المقروء: تتغير مع كل رسالة جديدة فقط. */
const signature = (u: Unread) =>
  u.conversations.map((c) => `${c.id}:${c.unread}:${c.lastAt}`).join("|");
function seen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function markSeen(value: string) {
  try {
    sessionStorage.setItem(SEEN_KEY, value);
  } catch {
    // التخزين اختياري.
  }
}

/** تنبيه قوي «لديك رسالة جديدة» لكل حساب مسجّل، بصوت واهتزاز، لحظيًا، والتحديث كل دقيقة احتياط. */
export function MessageAlert() {
  const { user } = useSession();
  const pathname = usePathname();
  const [data, setData] = useState<Unread | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const onMessages = pathname === "/messages";

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const result = await api<Unread>("/api/conversations/unread");
      lastTotal = result.total;
      window.dispatchEvent(
        new CustomEvent(UNREAD_EVENT, { detail: result.total }),
      );
      const sig = signature(result);
      if (result.total > 0 && sig !== seen()) {
        setData(result);
        if (!onMessages) chime();
      } else if (result.total === 0) setData(null);
    } catch {
      // انقطاع مؤقت أو انتهاء الجلسة: نعيد المحاولة في الدورة التالية.
    }
  }, [onMessages]);

  useEffect(() => {
    if (!user) return;
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(UNREAD_REFRESH, check);
    // تنبيه «لديك رسالة جديدة» لحظي في كل صفحات الموقع.
    const off = onLive((e) => {
      if (e.type === "message" || e.type === "sync") check();
    });
    return () => {
      off();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(UNREAD_REFRESH, check);
    };
  }, [user, check]);

  // في صفحة المحادثات نفسها لا حاجة للنافذة؛ الشارة تكفي.
  const open = Boolean(data && data.total > 0 && !onMessages);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const base = document.title.replace(/^✉ /, "");
    document.title = data?.total ? `✉ ${base}` : base;
  }, [data?.total]);

  function later() {
    if (data) markSeen(signature(data));
    setData(null);
  }

  if (!user) return null;
  const list = data?.conversations ?? [];
  const first = list[0];
  return (
    <dialog
      ref={dialog}
      className="order-alert message-alert"
      aria-labelledby="message-alert-title"
      onCancel={(event) => {
        event.preventDefault();
        later();
      }}
    >
      <div className="order-alert-head">
        <span className="message-alert-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path
              d="M4 5h16v11H9l-5 4z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 id="message-alert-title">
          {(data?.total ?? 0) > 1
            ? `لديك ${data?.total} رسائل جديدة`
            : "لديك رسالة جديدة"}
        </h2>
      </div>
      <ul className="order-alert-list">
        {list.slice(0, 3).map((c) => (
          <li key={c.id}>
            <strong>
              {c.title}
              {c.unread > 1 && <small> ({c.unread})</small>}
            </strong>
            {c.preview && <span>{c.preview.slice(0, 120)}</span>}
          </li>
        ))}
      </ul>
      <div className="order-alert-actions">
        {first && (
          <Link
            href={
              list.length > 1
                ? "/messages"
                : `/messages?c=${encodeURIComponent(first.id)}`
            }
            className="button"
            onClick={later}
          >
            {list.length > 1 ? "فتح المحادثات" : "فتح المحادثة والرد"}
          </Link>
        )}
        <button type="button" className="button light" onClick={later}>
          <T k="c.msgAlert.t2" />
        </button>
      </div>
    </dialog>
  );
}
