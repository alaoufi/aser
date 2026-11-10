"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountShell, Guard, api, useSession } from "./shared";
import c from "./chat.module.css";
import { UNREAD_REFRESH } from "@/components/public/message-alert";

type Summary = {
  id: string;
  side: "customer" | "producer";
  title: string;
  preview: string | null;
  lastAt: string;
  unread: number;
};
type Message = { id: string; body: string; mine: boolean; createdAt: string };
type Thread = {
  conversation: {
    id: string;
    title: string;
    side: "customer" | "producer";
    producerSlug: string;
  };
  messages: Message[];
};

const time = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
const day = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join(" ");

export function Messages() {
  const session = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get("c") ?? "";
  const [list, setList] = useState<Summary[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session.user) return;
    let active = true;
    const load = () =>
      api<{ conversations: Summary[] }>("/api/conversations")
        .then((d) => active && setList(d.conversations))
        .catch((e) => active && setError((e as Error).message));
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session.user?.id, openId]);
  const open = (id: string) =>
    router.push(id ? `/messages?c=${encodeURIComponent(id)}` : "/messages");
  return (
    <AccountShell>
      <Guard {...session} />
      {session.user && (
        <div className={c.app} data-open={openId ? "true" : "false"}>
          <aside className={c.list} aria-label="المحادثات">
            <div className={c.listHead}>
              <h1>المحادثات</h1>
            </div>
            {error && <p className={c.error}>{error}</p>}
            {list === null ? (
              <p role="status" className={c.empty}>
                جارٍ تحميل المحادثات…
              </p>
            ) : list.length === 0 ? (
              <p className={c.empty}>
                لا توجد محادثات بعد. افتح صفحة أسرة منتجة أو منتج واضغط «مراسلة
                الأسرة المنتجة»، أو «مراسلة» من أي طلب في «طلباتي».{" "}
                <Link href="/producers">تصفح الأسر المنتجة ←</Link>
              </p>
            ) : (
              list.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={c.item}
                  aria-current={x.id === openId}
                  onClick={() => open(x.id)}
                >
                  <span className={c.avatar} aria-hidden="true">
                    {initials(x.title)}
                  </span>
                  <span className={c.itemText}>
                    <span className={c.itemTop}>
                      <strong>{x.title}</strong>
                      <time dateTime={x.lastAt}>{time(x.lastAt)}</time>
                    </span>
                    <span className={c.itemTop}>
                      <span className={c.preview}>
                        {x.preview ?? "ابدأ المحادثة"}
                      </span>
                      {x.unread > 0 && (
                        <span className={c.unread}>
                          {x.unread}
                          <span className="sr-only"> رسالة غير مقروءة</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </aside>
          <section className={c.thread} aria-label="المحادثة">
            {openId ? (
              <Conversation key={openId} id={openId} onBack={() => open("")} />
            ) : (
              <p className={c.empty}>اختر محادثة لعرضها.</p>
            )}
          </section>
        </div>
      )}
    </AccountShell>
  );
}

function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const merge = (incoming: Message[]) =>
    setThread((t) => {
      if (!t) return t;
      const seen = new Set(t.messages.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? { ...t, messages: [...t.messages, ...fresh] } : t;
    });
  useEffect(() => {
    let active = true;
    api<Thread>(`/api/conversations/${encodeURIComponent(id)}`)
      .then((d) => {
        if (!active) return;
        setThread(d);
        // قُرئت المحادثة: تحدّث شارة الرسائل الجديدة فورًا.
        window.dispatchEvent(new Event(UNREAD_REFRESH));
      })
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [id]);
  const last = thread?.messages.at(-1)?.createdAt;
  useEffect(() => {
    if (!thread) return;
    const timer = setInterval(() => {
      const after = last ? `?after=${encodeURIComponent(last)}` : "";
      api<Thread>(`/api/conversations/${encodeURIComponent(id)}${after}`)
        .then((d) => merge(d.messages))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [id, Boolean(thread), last]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      const m = await api<Message>(
        `/api/conversations/${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      merge([m]);
      setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error && !thread) return <p className={c.error}>{error}</p>;
  if (!thread)
    return (
      <p role="status" className={c.empty}>
        جارٍ فتح المحادثة…
      </p>
    );
  let lastDay = "";
  return (
    <>
      <div className={c.threadHead}>
        <button
          type="button"
          className={c.back}
          onClick={onBack}
          aria-label="رجوع للمحادثات"
        >
          →
        </button>
        <span className={c.avatar} aria-hidden="true">
          {initials(thread.conversation.title)}
        </span>
        <h2>
          {thread.conversation.side === "customer" ? (
            <Link
              href={`/producers/${encodeURIComponent(thread.conversation.producerSlug)}`}
              style={{ color: "inherit" }}
            >
              {thread.conversation.title}
            </Link>
          ) : (
            thread.conversation.title
          )}
        </h2>
      </div>
      <div className={c.messages} aria-live="polite">
        {thread.messages.length === 0 && (
          <p className={c.day}>اكتب رسالتك الأولى. المحادثة محفوظة لكما.</p>
        )}
        {thread.messages.map((m) => {
          const d = day(m.createdAt);
          const label = d !== lastDay ? d : null;
          lastDay = d;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {label && <p className={c.day}>{label}</p>}
              <p className={`${c.bubble} ${m.mine ? c.mine : ""}`}>
                {m.body}
                <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
              </p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <p className={c.error}>{error}</p>}
      <form className={c.composer} onSubmit={send}>
        <label className="sr-only" htmlFor="chat-message">
          اكتب رسالة
        </label>
        <textarea
          id="chat-message"
          rows={1}
          maxLength={2000}
          placeholder="اكتب رسالة"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className={c.send}
          disabled={busy || !draft.trim()}
          aria-label="إرسال"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            style={{ transform: "scaleX(-1)" }}
          >
            <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </>
  );
}

/** زر «مراسلة» من الطلب: صاحب الطلب يراسل الأسرة، والأسرة تراسل صاحب الطلب. */
export function OrderChatButton({
  orderId,
  label,
  className = "button",
}: {
  orderId: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const d = await api<{ id: string }>("/api/conversations", {
              method: "POST",
              body: JSON.stringify({ order: orderId }),
            });
            router.push(`/messages?c=${encodeURIComponent(d.id)}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "جارٍ فتح المحادثة…" : label}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

/** زر «مراسلة الأسرة المنتجة» في صفحة المنتج أو الأسرة. */
export function ChatButton({ producerSlug }: { producerSlug: string }) {
  const session = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!session.ready) return null;
  if (!session.user)
    return (
      <Link className="button" href="/login">
        سجّل لمراسلة الأسرة المنتجة
      </Link>
    );
  return (
    <>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const d = await api<{ id: string }>("/api/conversations", {
              method: "POST",
              body: JSON.stringify({ producer: producerSlug }),
            });
            router.push(`/messages?c=${encodeURIComponent(d.id)}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "جارٍ فتح المحادثة…" : "مراسلة الأسرة المنتجة"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
