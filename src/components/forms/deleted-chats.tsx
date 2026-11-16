"use client";
import { useEffect, useState } from "react";
import { Message, api, s } from "./shared";

type Deleted = {
  id: string;
  conversationId: string;
  deletedAt: string;
  deletedBy: string | null;
  customerName: string;
  familyName: string;
  messages: number;
};
type Line = {
  id: string;
  body: string;
  createdAt: string;
  sender: string;
  customer: boolean;
  voiceMs: number | null;
};
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

/**
 * الإدارة ← «المحادثات المحذوفة»: ما حذفه أحد الطرفين يختفي منهما ويبقى هنا كاملًا
 * (للمراجعة عند البلاغات والخلافات فقط)، للاطلاع لا التعديل.
 */
export function DeletedChatsAdmin() {
  const [list, setList] = useState<Deleted[] | null>(null);
  const [open, setOpen] = useState("");
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ conversations: Deleted[] }>("/api/admin/conversations")
      .then((d) => setList(d.conversations))
      .catch((e) => setError((e as Error).message));
  }, []);
  async function toggle(id: string) {
    if (open === id) return setOpen("");
    setOpen(id);
    if (lines[id]) return;
    try {
      const d = await api<{ messages: Line[] }>(
        `/api/admin/conversations/${encodeURIComponent(id)}`,
      );
      setLines((l) => ({ ...l, [id]: d.messages }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section aria-label="المحادثات المحذوفة">
      <h2>المحادثات المحذوفة</h2>
      <p className={s.muted}>
        المحادثة التي يحذفها أحد الطرفين تختفي من الطرفين، وتبقى هنا كما كانت
        لحظة حذفها، للمراجعة عند البلاغات والخلافات فقط.
      </p>
      <Message error={error} />
      {list === null && !error ? (
        <p role="status">جارٍ التحميل…</p>
      ) : list?.length ? (
        <ul className={s.courierList}>
          {list.map((d) => (
            <li key={d.id} className={s.card}>
              <h3>
                {d.familyName} ↔ {d.customerName}
              </h3>
              <p className={s.muted}>
                حذفها {d.deletedBy ?? "حساب محذوف"} · {when(d.deletedAt)} ·{" "}
                {d.messages} رسالة
              </p>
              <button
                type="button"
                className={s.buttonSecondary}
                aria-expanded={open === d.id}
                onClick={() => toggle(d.id)}
              >
                {open === d.id ? "إخفاء الرسائل" : "عرض الرسائل"}
              </button>
              {open === d.id && (
                <ol
                  className="contract-transcript"
                  aria-label={`رسائل ${d.familyName} و${d.customerName}`}
                >
                  {(lines[d.id] ?? []).map((m) => (
                    <li
                      key={m.id}
                      className={m.customer ? "customer" : "family"}
                    >
                      <strong>{m.sender}</strong>{" "}
                      <small>{when(m.createdAt)}</small>
                      {m.voiceMs != null ? (
                        <p>
                          {/* biome-ignore lint/a11y/useMediaCaption: تسجيل صوتي بلا نص مكتوب */}
                          <audio
                            controls
                            preload="none"
                            src={`/api/admin/conversations/voice/${encodeURIComponent(m.id)}`}
                          />
                        </p>
                      ) : (
                        <p>{m.body}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.notice}>لا توجد محادثات محذوفة.</p>
      )}
    </section>
  );
}
