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
type Message = {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
  /** مدة الرسالة الصوتية بالميلي ثانية؛ غيابها يعني رسالة نصية. */
  voiceMs?: number | null;
  /** تظهر فورًا قبل رد الخادم (🕓)، ثم تُستبدل بالرسالة المحفوظة. */
  pending?: boolean;
};
/** آخر ما عُرض من كل محادثة ومن القائمة: يفتح فورًا ثم يتحدّث في الخلفية. */
const threadCache = new Map<string, Thread>();
let listCache: Summary[] | null = null;
/** يجمع تحديثات متقاربة (رسالة وقراءة معًا) في طلب واحد. */
function debounce(fn: () => void, ms = 250) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
  run.cancel = () => t && clearTimeout(t);
  return run;
}
/** الحد الأقصى للرسالة الصوتية: دقيقتان. */
const VOICE_LIMIT = 120_000;
const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
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
  const [list, setList] = useState<Summary[] | null>(() => listCache);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // تحميل القائمة يبدأ فورًا مع فحص الجلسة لا بعده، فلا ينتظر المستخدم طلبين متتاليين.
  const signedOut = session.ready && !session.user;
  useEffect(() => {
    if (signedOut) return;
    let active = true;
    const load = () =>
      api<{ conversations: Summary[] }>("/api/conversations")
        .then((d) => {
          if (!active) return;
          listCache = d.conversations;
          setList(d.conversations);
        })
        .catch((e) => {
          if (active && session.ready) setError((e as Error).message);
        });
    load();
    const later = debounce(load);
    const timer = setInterval(load, 30000);
    const off = onLive(later);
    return () => {
      active = false;
      later.cancel();
      clearInterval(timer);
      off();
    };
  }, [signedOut, session.user?.id]);
  const open = (id: string) => {
    // فتح محادثة يقرؤها: تختفي شارتها فورًا دون انتظار إعادة تحميل القائمة.
    setList((l) => l && l.map((x) => (x.id === id ? { ...x, unread: 0 } : x)));
    setNotice("");
    router.push(id ? `/messages?c=${encodeURIComponent(id)}` : "/messages");
  };
  const removed = (id: string) => {
    setList((l) => {
      const next = l ? l.filter((x) => x.id !== id) : l;
      listCache = next;
      return next;
    });
    threadCache.delete(id);
    setNotice("حُذفت المحادثة من عندك وعند الطرف الآخر.");
    router.push("/messages");
  };
  return (
    // صفحة المحادثات بلا سطر روابط الحساب ولا فراغ علوي: الرسائل والقائمة في الرأس أصلًا.
    <AccountShell navigation={false} compact>
      {session.ready && <Guard {...session} />}
      {!signedOut && !session.error && (
        <div className={c.app} data-open={openId ? "true" : "false"}>
          <aside className={c.list} aria-label="المحادثات">
            <div className={c.listHead}>
              <h1>المحادثات</h1>
            </div>
            {error && <p className={c.error}>{error}</p>}
            {notice && (
              <p role="status" className={c.safetyNotice}>
                {notice}
              </p>
            )}
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
              <Conversation
                key={openId}
                id={openId}
                onBack={() => open("")}
                onDeleted={() => removed(openId)}
              />
            ) : (
              <p className={c.empty}>اختر محادثة لعرضها.</p>
            )}
          </section>
        </div>
      )}
    </AccountShell>
  );
}

function Conversation({
  id,
  onBack,
  onDeleted,
}: {
  id: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  // من الذاكرة فورًا إن فُتحت سابقًا، ثم تُحدَّث في الخلفية.
  const [thread, setThread] = useState<Thread | null>(
    () => threadCache.get(id) ?? null,
  );
  // حذفها الطرف الآخر وهي مفتوحة.
  const [gone, setGone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [recording, setRecording] = useState(false);
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
            ? "تم الحظر ✓ لا يستطيع أي طرف الإرسال في هذه المحادثة. يمكنك إلغاء الحظر من زر الخيارات ⋮."
            : "أُلغي الحظر.",
      );
      setReporting(false);
      setConfirmBlock(false);
      if (menu.current) menu.current.open = false;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // دمج بلا تكرار ومرتب بالوقت: رسالة وصلت متأخرة تأخذ مكانها الصحيح.
  const merge = (incoming: Message[]) =>
    setThread((t) => {
      if (!t) return t;
      const seen = new Set(t.messages.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return t;
      const messages = [...t.messages, ...fresh].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
      return { ...t, messages };
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
      .catch((e) => {
        if (!active) return;
        if ((e as { status?: number }).status === 404 && threadCache.has(id))
          setGone(true);
        setError((e as Error).message);
        threadCache.delete(id);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (thread) threadCache.set(id, thread);
  }, [id, thread]);
  const last = thread?.messages.at(-1)?.createdAt;
  useEffect(() => {
    if (!thread) return;
    const refresh = () => {
      // نافذة تداخل دقيقة قبل آخر رسالة: لا تضيع رسالة الطرف الآخر إن سبقت رسالتي بلحظة.
      const params = new URLSearchParams();
      if (last)
        params.set("after", new Date(Date.parse(last) - 60_000).toISOString());
      // لا تُعلَّم مقروءة والصفحة مخفية؛ تُقرأ عند العودة إليها.
      if (document.visibilityState !== "visible") params.set("read", "0");
      const q = params.size ? `?${params}` : "";
      api<Thread>(`/api/conversations/${encodeURIComponent(id)}${q}`)
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
        .catch((e) => {
          // حُذفت المحادثة من الطرف الآخر وهي مفتوحة.
          if ((e as { status?: number }).status === 404) {
            setGone(true);
            threadCache.delete(id);
          }
        });
    };
    // الرسائل والقراءة تصل لحظيًا، والتحديث كل 20 ثانية احتياط عند انقطاع البث.
    const later = debounce(refresh);
    const timer = setInterval(refresh, 20000);
    const off = onLive((e) => {
      if (e.c === id || e.type === "sync") later();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      later.cancel();
      clearInterval(timer);
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [id, Boolean(thread), last]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError("");
    // تظهر الرسالة فورًا بعلامة 🕓، ويُفرَّغ الحقل دون انتظار الخادم.
    const temp: Message = {
      id: `pending-${Date.now()}`,
      body,
      mine: true,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    merge([temp]);
    setDraft("");
    requestAnimationFrame(() => grow(input.current));
    try {
      const m = await api<Message>(
        `/api/conversations/${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setThread((t) =>
        t
          ? {
              ...t,
              messages: t.messages.filter((x) => x.id !== temp.id),
            }
          : t,
      );
      merge([m]);
    } catch (err) {
      // لم تُرسل: تُزال وتعود للحقل كما كُتبت.
      setThread((t) =>
        t ? { ...t, messages: t.messages.filter((x) => x.id !== temp.id) } : t,
      );
      setDraft((d) => d || body);
      setError((err as Error).message);
    }
  }
  if (gone)
    return (
      <p role="status" className={c.empty}>
        حُذفت هذه المحادثة.{" "}
        <button type="button" className={c.goneBack} onClick={onBack}>
          → المحادثات
        </button>
      </p>
    );
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
                  onClick={() => {
                    // الحظر بعد تأكيد صريح، لا من ضغطة واحدة.
                    setReporting(false);
                    setConfirmBlock(true);
                    if (menu.current) menu.current.open = false;
                  }}
                >
                  حظر المحادثة
                </button>
              )
            )}
            <button
              type="button"
              className={c.menuDanger}
              onClick={() => {
                setReporting(false);
                setConfirmBlock(false);
                setConfirmDelete(true);
                if (menu.current) menu.current.open = false;
              }}
            >
              حذف المحادثة
            </button>
          </div>
        </details>
      </div>
      {confirmDelete && (
        <div
          className={c.report}
          role="alertdialog"
          aria-labelledby="chat-delete-title"
          aria-describedby="chat-delete-text"
        >
          <strong id="chat-delete-title">
            حذف المحادثة مع {thread.conversation.title}؟
          </strong>
          <p id="chat-delete-text">
            تُحذف المحادثة ورسائلها من عندك وعند {thread.conversation.title}،
            ولا يمكن استرجاعها. تبقى نسخة محفوظة لدى إدارة المنصة للمراجعة عند
            الحاجة فقط.
          </p>
          <div className={c.reportActions}>
            <button
              type="button"
              className={c.danger}
              autoFocus
              onClick={async () => {
                setError("");
                try {
                  await api(`/api/conversations/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                  });
                  threadCache.delete(id);
                  onDeleted();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              نعم، احذف المحادثة
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}>
              تراجع
            </button>
          </div>
        </div>
      )}
      {confirmBlock && (
        <div
          className={c.report}
          role="alertdialog"
          aria-labelledby="chat-block-title"
          aria-describedby="chat-block-text"
        >
          <strong id="chat-block-title">
            هل تريد حظر المحادثة مع {thread.conversation.title}؟
          </strong>
          <p id="chat-block-text">
            بعد الحظر لن يستطيع أي منكما إرسال رسائل في هذه المحادثة، وتبقى
            الرسائل السابقة محفوظة. يمكنك إلغاء الحظر لاحقًا من زر الخيارات ⋮.
          </p>
          <div className={c.reportActions}>
            <button
              type="button"
              className={c.danger}
              autoFocus
              onClick={() => moderate({ action: "block" })}
            >
              نعم، احظر المحادثة
            </button>
            <button type="button" onClick={() => setConfirmBlock(false)}>
              تراجع
            </button>
          </div>
        </div>
      )}
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
                {m.voiceMs != null ? (
                  <span className={c.voice}>
                    {/* biome-ignore lint/a11y/useMediaCaption: تسجيل صوتي بين طرفي المحادثة لا يوجد له نص مكتوب؛ مدته معروضة بجانبه */}
                    <audio
                      controls
                      preload="none"
                      src={`/api/conversations/${encodeURIComponent(id)}/voice/${encodeURIComponent(m.id)}`}
                      aria-label={`رسالة صوتية مدتها ${clock(m.voiceMs)}`}
                    />
                    <small>🎤 {clock(m.voiceMs)}</small>
                  </span>
                ) : (
                  m.body
                )}
                <span className={c.meta}>
                  <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
                  {m.mine && m.pending ? (
                    <span
                      className={c.ticks}
                      role="img"
                      aria-label="جارٍ الإرسال"
                      title="جارٍ الإرسال"
                    >
                      🕓
                    </span>
                  ) : (
                    m.mine && (
                      <Ticks
                        at={m.createdAt}
                        read={thread.conversation.otherReadAt}
                        delivered={thread.conversation.otherDeliveredAt}
                      />
                    )
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
            hidden={recording}
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
          {!draft.trim() && (
            <VoiceRecorder
              id={id}
              onRecording={setRecording}
              onError={setError}
              onSent={(m) => merge([m])}
            />
          )}
          <button
            className={c.send}
            hidden={!draft.trim()}
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

/**
 * التسجيل الصوتي: ضغطة على الميكروفون تبدأ التسجيل (حتى دقيقتين)، ثم «إرسال» أو «إلغاء».
 * يتوقف ويُرسل تلقائيًا عند الحد. الميكروفون يُغلق فور الانتهاء.
 */
function VoiceRecorder({
  id,
  onRecording,
  onError,
  onSent,
}: {
  id: string;
  onRecording: (on: boolean) => void;
  onError: (message: string) => void;
  onSent: (message: Message) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [elapsed, setElapsed] = useState(0);
  const active = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    cancel: boolean;
    timer: number;
  } | null>(null);
  useEffect(
    () => () => {
      // مغادرة المحادثة أثناء التسجيل: يُلغى ويُغلق الميكروفون.
      const r = active.current;
      if (!r) return;
      r.cancel = true;
      clearInterval(r.timer);
      if (r.recorder.state !== "inactive") r.recorder.stop();
      for (const t of r.stream.getTracks()) t.stop();
    },
    [],
  );
  async function start() {
    onError("");
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      onError("متصفحك لا يدعم التسجيل الصوتي. حدّثه أو استخدم متصفحًا آخر.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError(
        "لم يُسمح باستخدام الميكروفون. اسمح للموقع به من إعدادات المتصفح ثم حاول مجددًا.",
      );
      return;
    }
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32000,
    });
    const chunks: Blob[] = [];
    const started = Date.now();
    const r = { recorder, stream, cancel: false, timer: 0 };
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearInterval(r.timer);
      for (const t of stream.getTracks()) t.stop();
      active.current = null;
      const duration = Math.min(Date.now() - started, VOICE_LIMIT);
      if (r.cancel) {
        setState("idle");
        onRecording(false);
        return;
      }
      if (duration < 1000) {
        setState("idle");
        onRecording(false);
        onError("التسجيل قصير جدًا. سجّل ثانية على الأقل.");
        return;
      }
      setState("sending");
      const form = new FormData();
      form.append(
        "file",
        new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        }),
        "voice",
      );
      form.append("duration", String(duration));
      try {
        onSent(
          await api<Message>(
            `/api/conversations/${encodeURIComponent(id)}/voice`,
            { method: "POST", body: form },
          ),
        );
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setState("idle");
        onRecording(false);
      }
    };
    recorder.start(250);
    r.timer = window.setInterval(() => {
      const d = Date.now() - started;
      setElapsed(d);
      if (d >= VOICE_LIMIT && recorder.state === "recording") recorder.stop();
    }, 200);
    active.current = r;
    setElapsed(0);
    setState("recording");
    onRecording(true);
  }
  const finish = (cancel: boolean) => {
    const r = active.current;
    if (!r) return;
    r.cancel = cancel;
    if (r.recorder.state !== "inactive") r.recorder.stop();
  };
  if (state === "idle")
    return (
      <button
        type="button"
        className={c.send}
        onClick={start}
        aria-label="تسجيل رسالة صوتية"
        title="تسجيل رسالة صوتية (حتى دقيقتين)"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12z" />
        </svg>
      </button>
    );
  return (
    <>
      <p className={c.recording} role="status">
        <span className={c.recDot} aria-hidden="true" />
        {state === "sending"
          ? "جارٍ إرسال التسجيل…"
          : `جارٍ التسجيل ${clock(elapsed)} من ${clock(VOICE_LIMIT)}`}
      </p>
      <button
        type="button"
        className={c.recCancel}
        onClick={() => finish(true)}
        disabled={state === "sending"}
      >
        إلغاء
      </button>
      <button
        type="button"
        className={c.send}
        onClick={() => finish(false)}
        disabled={state === "sending"}
        aria-label="إرسال التسجيل"
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
