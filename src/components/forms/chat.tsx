"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountShell, Guard, api, useSession } from "./shared";
import c from "./chat.module.css";
import { UNREAD_REFRESH } from "@/components/public/message-alert";
import { onLive } from "./live";

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
    blocked?: boolean;
    blockedByMe?: boolean;
    otherReadAt?: string;
    otherDeliveredAt?: string;
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
    const timer = setInterval(load, 30000);
    const off = onLive(() => load());
    return () => {
      active = false;
      clearInterval(timer);
      off();
    };
  }, [session.user?.id, openId]);
  const open = (id: string) =>
    router.push(id ? `/messages?c=${encodeURIComponent(id)}` : "/messages");
  return (
    // صفحة المحادثات بلا سطر روابط الحساب ولا فراغ علوي: الرسائل والقائمة في الرأس أصلًا.
    <AccountShell navigation={false} compact>
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
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  /** حقل الكتابة يتمدد مع الرسالة حتى ستة أسطر تقريبًا ثم يمرّر. */
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };
  async function moderate(body: Record<string, unknown>) {
    setError("");
    try {
      const r = await api<{
        blocked: boolean;
        blockedByMe: boolean;
        reported?: boolean;
      }>(`/api/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setThread((t) =>
        t
          ? {
              ...t,
              conversation: {
                ...t.conversation,
                blocked: r.blocked,
                blockedByMe: r.blockedByMe,
              },
            }
          : t,
      );
      setNotice(
        r.reported
          ? "وصل بلاغك للإدارة وستراجعه. شكرًا لك."
          : r.blocked
            ? "حُظرت المحادثة؛ لا يستطيع أي طرف الإرسال فيها."
            : "أُلغي الحظر.",
      );
      setReporting(false);
      if (menu.current) menu.current.open = false;
    } catch (e) {
      setError((e as Error).message);
    }
  }
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
        // على الجوال: إظهار حقل الكتابة كاملًا عند فتح المحادثة.
        requestAnimationFrame(() =>
          composer.current?.scrollIntoView({ block: "nearest" }),
        );
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
    const refresh = () => {
      const after = last ? `?after=${encodeURIComponent(last)}` : "";
      api<Thread>(`/api/conversations/${encodeURIComponent(id)}${after}`)
        .then((d) => {
          merge(d.messages);
          // تحديث علامات الوصول والقراءة لرسائلي السابقة.
          setThread((t) =>
            t
              ? {
                  ...t,
                  conversation: {
                    ...t.conversation,
                    otherReadAt: d.conversation.otherReadAt,
                    otherDeliveredAt: d.conversation.otherDeliveredAt,
                  },
                }
              : t,
          );
        })
        .catch(() => {});
    };
    // الرسائل والقراءة تصل لحظيًا، والتحديث كل 20 ثانية احتياط عند انقطاع البث.
    const timer = setInterval(refresh, 20000);
    const off = onLive((e) => {
      if (e.c === id) refresh();
    });
    return () => {
      clearInterval(timer);
      off();
    };
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
      requestAnimationFrame(() => grow(input.current));
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
        <details className={c.safety} ref={menu}>
          <summary aria-label="خيارات المحادثة">⋮</summary>
          <div className={c.safetyMenu}>
            <button type="button" onClick={() => setReporting(true)}>
              إبلاغ عن المحادثة
            </button>
            {thread.conversation.blockedByMe ? (
              <button
                type="button"
                onClick={() => moderate({ action: "unblock" })}
              >
                إلغاء الحظر
              </button>
            ) : (
              !thread.conversation.blocked && (
                <button
                  type="button"
                  onClick={() => moderate({ action: "block" })}
                >
                  حظر المحادثة
                </button>
              )
            )}
          </div>
        </details>
      </div>
      {reporting && (
        <form
          className={c.report}
          aria-label="إبلاغ عن المحادثة"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            moderate({
              action: "report",
              reason: String(f.get("reason") ?? ""),
              block: f.get("block") === "on",
            });
          }}
        >
          <label htmlFor="chat-report-reason">سبب البلاغ</label>
          <textarea
            id="chat-report-reason"
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            rows={3}
          />
          <label className={c.reportBlock}>
            <input type="checkbox" name="block" defaultChecked /> حظر المحادثة
            أيضًا
          </label>
          <div className={c.reportActions}>
            <button type="submit">إرسال البلاغ</button>
            <button type="button" onClick={() => setReporting(false)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
      {notice && (
        <p role="status" className={c.safetyNotice}>
          {notice}
        </p>
      )}
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
                <span className={c.meta}>
                  <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
                  {m.mine && (
                    <Ticks
                      at={m.createdAt}
                      read={thread.conversation.otherReadAt}
                      delivered={thread.conversation.otherDeliveredAt}
                    />
                  )}
                </span>
              </p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <p className={c.error}>{error}</p>}
      {thread.conversation.blocked ? (
        <p className={c.blockedNote}>
          {thread.conversation.blockedByMe
            ? "حظرت هذه المحادثة. يمكنك إلغاء الحظر من زر الخيارات ⋮."
            : "لا يمكن الإرسال في هذه المحادثة."}
        </p>
      ) : (
        <form className={c.composer} onSubmit={send} ref={composer}>
          <label className="sr-only" htmlFor="chat-message">
            اكتب رسالة
          </label>
          <textarea
            id="chat-message"
            rows={1}
            maxLength={2000}
            placeholder="اكتب رسالة"
            value={draft}
            ref={input}
            onChange={(e) => {
              setDraft(e.target.value);
              grow(e.currentTarget);
            }}
            onKeyDown={(e) => {
              // الإدخال يبدأ سطرًا جديدًا؛ الإرسال بالزر (أو Ctrl/⌘ + الإدخال).
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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
      )}
    </>
  );
}

/** علامات الرسالة كواتساب: ✓ أُرسلت، ✓✓ رمادي وصلت، ✓✓ أزرق قُرئت. */
function Ticks({
  at,
  read,
  delivered,
}: {
  at: string;
  read?: string;
  delivered?: string;
}) {
  const t = Date.parse(at);
  const state =
    read && Date.parse(read) >= t
      ? "read"
      : delivered && Date.parse(delivered) >= t
        ? "delivered"
        : "sent";
  const label =
    state === "read" ? "قُرئت" : state === "delivered" ? "وصلت" : "أُرسلت";
  return (
    <span
      className={`${c.ticks} ${state === "read" ? c.ticksRead : ""}`}
      role="img"
      aria-label={label}
      title={label}
      data-state={state}
    >
      <svg viewBox="0 0 18 12" width="17" height="11" aria-hidden="true">
        <path
          d="M1 6.5 4.5 10 11 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {state !== "sent" && (
          <path
            d="M7.5 9.2 8.3 10 14.8 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
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
  const [own, setOwn] = useState<boolean | null>(null);
  const role = session.user?.role;
  useEffect(() => {
    if (role !== "producer") {
      setOwn(false);
      return;
    }
    // الأسرة لا تراسل نفسها: لا يظهر الزر في صفحاتها هي.
    let active = true;
    api<{ slug: string | null }>("/api/producer/status")
      .then((d) => active && setOwn(d.slug === producerSlug))
      .catch(() => active && setOwn(false));
    return () => {
      active = false;
    };
  }, [role, producerSlug]);
  if (!session.ready) return null;
  if (session.user && own !== false) return null;
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
