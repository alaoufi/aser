"use client";
import { useEffect, useState } from "react";
import { api, s as forms } from "@/components/forms/shared";
import css from "./activity-admin.module.css";

/** «سجل النشاطات»: ما فعله أعضاء الإدارة، الأحدث أولًا، مع تصفية بالنوع والبحث بالاسم أو الجوال. */
type Row = {
  id: string;
  action: string;
  label: string;
  actorName: string | null;
  actorPhone: string | null;
  targetId: string | null;
  details: string;
  createdAt: string;
};
type Data = {
  rows: Row[];
  more: boolean;
  groups: { id: string; label: string }[];
};

const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

export function ActivityAdmin() {
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [groups, setGroups] = useState<Data["groups"]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const url = (before?: string) =>
    `/api/admin/activity?${new URLSearchParams({
      group,
      q: asked,
      ...(before ? { before } : {}),
    })}`;
  useEffect(() => {
    let live = true;
    setRows(null);
    api<Data>(url())
      .then((d) => {
        if (!live) return;
        setRows(d.rows);
        setGroups(d.groups);
        setMore(d.more);
        setError("");
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
    // url يتبع group وasked فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, asked]);

  async function older() {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const d = await api<Data>(url(rows[rows.length - 1].createdAt));
      setRows([...rows, ...d.rows]);
      setMore(d.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={css.page} aria-labelledby="activity-title">
      <h1 id="activity-title" className="sr-only">
        سجل النشاطات
      </h1>
      <p className={css.help}>
        كل إجراء يقوم به أعضاء الإدارة يُسجَّل هنا بوقته وصاحبه: الاعتماد،
        والحذف، وتعديل النصوص والإعدادات، والنسخ الاحتياطية. السجل للاطلاع ولا
        يُعدَّل.
      </p>
      <form
        className={css.filters}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(q.trim());
        }}
      >
        <label className={forms.field}>
          النوع
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">كل النشاطات</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className={forms.field}>
          العضو (الاسم أو الجوال)
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button type="submit" className={forms.button}>
          بحث
        </button>
      </form>
      {error && (
        <p role="alert" className={forms.error}>
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">جارٍ تحميل السجل…</p>}
      {rows && rows.length === 0 && (
        <p className={forms.notice}>لا نشاطات مطابقة.</p>
      )}
      {rows && rows.length > 0 && (
        <ol className={css.list} aria-label="النشاطات">
          {rows.map((r) => (
            <li key={r.id} className={css.row}>
              <div className={css.head}>
                <strong>{r.label}</strong>
                <time dateTime={r.createdAt}>{when(r.createdAt)}</time>
              </div>
              <p className={css.who}>
                {r.actorName ?? "عضو محذوف"}
                {r.actorPhone && (
                  <bdi dir="ltr" className={css.phone}>
                    {r.actorPhone}
                  </bdi>
                )}
              </p>
              {r.details !== "{}" && (
                <code dir="ltr" className={css.details}>
                  {r.details}
                </code>
              )}
            </li>
          ))}
        </ol>
      )}
      {more && (
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={older}
          disabled={busy}
        >
          {busy ? "جارٍ التحميل…" : "أقدم"}
        </button>
      )}
    </section>
  );
}
