"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AccountShell,
  MemberNo,
  Guard,
  Message,
  api,
  isFamilyAccount,
  s,
  useSession,
} from "./shared";
import { ChatButton } from "./chat";

/**
 * «دليلي»: دفتر جهات خاص بصاحبه (قرار المالك 2026-11-22). العميل يحفظ الأسر والمندوبين،
 * والأسرة عملاءها ومندوبيها، وكلٌّ يضيف جهة يدويًا أو من جهات جواله (أندرويد Chrome).
 * يظهر من بيانات تواصل الجهة ما تسمح به فقط، وما أضافه صاحب الدليل بنفسه.
 */
type Entry = {
  id: string;
  kind: "family" | "courier" | "customer" | "contact";
  name: string;
  memberNo: number | null;
  slug: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  ownPhone: string | null;
  ownWhatsapp: string | null;
  note: string;
};
type ContactsApi = {
  select: (
    props: string[],
    opts: { multiple: boolean },
  ) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

const KINDS: { kind: Entry["kind"]; label: string }[] = [
  { kind: "family", label: "الأسر المنتجة" },
  { kind: "customer", label: "عملائي" },
  { kind: "courier", label: "المندوبون" },
  { kind: "contact", label: "جهاتي" },
];
const digits = (p: string) => p.replace(/\D/g, "");

export function Directory() {
  const session = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const load = () =>
    api<{ entries: Entry[] }>("/api/directory")
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (session.user) load();
    setPicker(typeof navigator !== "undefined" && "contacts" in navigator);
  }, [session.user]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function fromPhone() {
    const contacts = (navigator as unknown as { contacts: ContactsApi })
      .contacts;
    let picked: { name?: string[]; tel?: string[] }[] = [];
    try {
      picked = await contacts.select(["name", "tel"], { multiple: true });
    } catch {
      return;
    }
    const list = picked
      .filter((c) => c.tel?.[0])
      .map((c) => ({ name: c.name?.[0] ?? "", phone: c.tel?.[0] ?? "" }))
      .slice(0, 50);
    if (!list.length) return;
    await run(async () => {
      const r = await api<{ added: number; skipped: number }>(
        "/api/directory/contacts",
        {
          method: "POST",
          body: JSON.stringify({ contacts: list }),
        },
      );
      setSuccess(
        `أُضيفت ${r.added} جهة${r.skipped ? `، وتُركت ${r.skipped} (مكررة أو رقمها غير صحيح)` : ""}.`,
      );
    }, "");
  }

  const family = isFamilyAccount(session.user);
  const shown = KINDS.filter((k) => k.kind !== "customer" || family);
  return (
    <AccountShell>
      <Guard {...session} />
      {session.user && (
        <section aria-labelledby="directory-title" className="directory">
          <h1 id="directory-title">دليلي</h1>
          <p className={s.muted}>
            {family
              ? "احفظ عملاءك ومندوبيك والأسر التي تتعامل معها، وتواصل معهم بضغطة. الدليل لك وحدك."
              : "احفظ الأسر والمندوبين الذين تتعامل معهم، وتواصل معهم بضغطة. الدليل لك وحدك."}
          </p>
          <Message error={error} success={success} />
          <div className="directory-actions">
            <button
              type="button"
              className={s.button}
              onClick={() => setAdding((a) => !a)}
            >
              ＋ إضافة يدوية
            </button>
            {picker && (
              <button
                type="button"
                className={s.buttonSecondary}
                onClick={fromPhone}
              >
                من جهات الجوال
              </button>
            )}
          </div>
          {adding && (
            <ContactForm
              onCancel={() => setAdding(false)}
              onSave={(v) =>
                run(async () => {
                  await api("/api/directory", {
                    method: "POST",
                    body: JSON.stringify({ contact: v }),
                  });
                  setAdding(false);
                }, "✓ أُضيفت الجهة.")
              }
            />
          )}
          {!entries ? (
            <p role="status">جارٍ التحميل…</p>
          ) : !entries.length ? (
            <p className={s.notice}>
              دليلك فارغ. احفظ أسرة من صفحتها بزر «أضف إلى دليلي»، أو أضف جهة
              يدويًا.
            </p>
          ) : (
            shown.map((k) => {
              const list = entries.filter((e) => e.kind === k.kind);
              if (!list.length) return null;
              return (
                <section
                  key={k.kind}
                  aria-label={k.label}
                  className="directory-group"
                >
                  <h2>
                    {k.label} <small>({list.length})</small>
                  </h2>
                  <ul className="directory-list">
                    {list.map((e) => {
                      const phone = e.ownPhone || e.phone;
                      const wa = e.ownWhatsapp || e.whatsapp;
                      return (
                        <li key={e.id} className={`${s.card} directory-card`}>
                          <div className="directory-head">
                            <MemberNo no={e.memberNo} />
                            <strong>
                              {e.slug ? (
                                <Link href={`/producers/${e.slug}`}>
                                  {e.name}
                                </Link>
                              ) : (
                                e.name
                              )}
                            </strong>
                            {e.city && <small>{e.city}</small>}
                          </div>
                          {e.note && <p className={s.muted}>{e.note}</p>}
                          <div className="directory-contact">
                            {phone && (
                              <a
                                className={s.buttonSecondary}
                                href={`tel:+${digits(phone)}`}
                              >
                                اتصال
                              </a>
                            )}
                            {wa && (
                              <a
                                className={s.buttonSecondary}
                                href={`https://wa.me/${digits(wa)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                واتساب
                              </a>
                            )}
                            {e.kind === "family" && e.slug && (
                              <ChatButton producerSlug={e.slug} />
                            )}
                            {!phone && !wa && e.kind !== "family" && (
                              <small className={s.muted}>
                                لا رقم ظاهر؛ أضف جوالًا أو واتساب.
                              </small>
                            )}
                          </div>
                          <div className="directory-tools">
                            <button
                              type="button"
                              className="text-link"
                              onClick={() =>
                                setEditing(editing === e.id ? null : e.id)
                              }
                            >
                              {editing === e.id ? "إغلاق" : "تعديل"}
                            </button>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() =>
                                window.confirm(`حذف «${e.name}» من دليلك؟`) &&
                                run(
                                  () =>
                                    api(`/api/directory/${e.id}`, {
                                      method: "DELETE",
                                    }),
                                  "✓ حُذفت.",
                                )
                              }
                            >
                              حذف
                            </button>
                          </div>
                          {editing === e.id && (
                            <ContactForm
                              entry={e}
                              onCancel={() => setEditing(null)}
                              onSave={(v) =>
                                run(async () => {
                                  await api(`/api/directory/${e.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify(v),
                                  });
                                  setEditing(null);
                                }, "✓ حُفظ.")
                              }
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </section>
      )}
    </AccountShell>
  );
}

function ContactForm({
  entry,
  onSave,
  onCancel,
}: {
  entry?: Entry;
  onSave: (v: {
    name?: string;
    phone: string;
    whatsapp: string;
    note: string;
  }) => void;
  onCancel: () => void;
}) {
  const manual = !entry || entry.kind === "contact";
  return (
    <form
      className={`${s.form} directory-form`}
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        onSave({
          ...(manual ? { name: String(f.get("name") ?? "") } : {}),
          phone: String(f.get("phone") ?? ""),
          whatsapp: String(f.get("whatsapp") ?? ""),
          note: String(f.get("note") ?? ""),
        });
      }}
    >
      {manual && (
        <label className={s.field}>
          <span>الاسم</span>
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={entry?.name ?? ""}
          />
        </label>
      )}
      <label className={s.field}>
        <span>الجوال</span>
        <input
          name="phone"
          inputMode="tel"
          dir="ltr"
          maxLength={30}
          defaultValue={entry?.ownPhone ?? ""}
          placeholder="05xxxxxxxx"
        />
      </label>
      <label className={s.field}>
        <span>واتساب</span>
        <input
          name="whatsapp"
          inputMode="tel"
          dir="ltr"
          maxLength={30}
          defaultValue={entry?.ownWhatsapp ?? ""}
          placeholder="05xxxxxxxx"
        />
      </label>
      <label className={s.field}>
        <span>ملاحظة (لك وحدك)</span>
        <input name="note" maxLength={300} defaultValue={entry?.note ?? ""} />
      </label>
      <div className={s.actions}>
        <button type="submit" className={s.button}>
          حفظ
        </button>
        <button type="button" className={s.buttonSecondary} onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/** «أضف إلى دليلي» في صفحة الأسرة، وصفحة المندوبين، وطلبات الأسرة (لعملائها). */
export function DirectoryButton({
  target,
}: {
  target: { producer: string } | { courier: string } | { customer: string };
}) {
  const { user } = useSession();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const query = new URLSearchParams(
    target as Record<string, string>,
  ).toString();
  useEffect(() => {
    if (!user) return;
    api<{ id: string | null }>(`/api/directory?${query}`)
      .then((d) => setSaved(Boolean(d.id)))
      .catch(() => setSaved(false));
  }, [user, query]);
  if (!user || saved === null) return null;
  if (saved)
    return (
      <Link href="/directory" className="button secondary directory-saved">
        ✓ في دليلي
      </Link>
    );
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          setError("");
          try {
            await api("/api/directory", {
              method: "POST",
              body: JSON.stringify(target),
            });
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        ＋ أضف إلى دليلي
      </button>
      {error && (
        <small role="alert" className="directory-error">
          {error}
        </small>
      )}
    </>
  );
}
