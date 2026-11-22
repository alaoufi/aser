"use client";
import { useEffect, useState } from "react";
import { api, s as forms } from "@/components/forms/shared";

/**
 * «دعوات الأصدقاء» (قرار المالك 2026-11-22): الاسم، والرصيد (عدد من سجلوا عن طريقه بالرابط أو برقمه).
 * الضغط على الاسم يعرض أسماء من سجلوا عن طريقه وأرقامهم.
 */
type Referrer = {
  id: string;
  memberNo: number;
  internalNo: number;
  name: string;
  phone: string;
  count: number;
  byLink: number;
  byNumber: number;
  last: string;
};
type Person = {
  memberNo: number;
  internalNo: number;
  name: string;
  phone: string;
  role: string;
  via: "link" | "number" | "phone";
  createdAt: string;
};
const ROLE: Record<string, string> = {
  customer: "عميل",
  producer: "أسرة منتجة",
  courier: "مندوب",
  admin: "إدارة",
};
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

export function InvitesAdmin() {
  const [rows, setRows] = useState<Referrer[] | null>(null);
  const [open, setOpen] = useState<Referrer | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ referrers: Referrer[] }>("/api/admin/invites")
      .then((d) => setRows(d.referrers))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!open) return;
    setPeople(null);
    api<{ people: Person[] }>(
      `/api/admin/invites?user=${encodeURIComponent(open.id)}`,
    )
      .then((d) => setPeople(d.people))
      .catch((e) => setError(e.message));
  }, [open]);
  if (error)
    return (
      <p role="alert" className={forms.error}>
        {error}
      </p>
    );
  if (!rows) return <p role="status">جارٍ التحميل…</p>;
  if (open)
    return (
      <section aria-labelledby="invited-title">
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={() => setOpen(null)}
        >
          → كل الأعضاء
        </button>
        <h2 id="invited-title">
          من سجلوا عن طريق <span dir="ltr">#{open.memberNo}</span> {open.name}{" "}
          <small dir="ltr">({open.phone})</small>
        </h2>
        <p className={forms.muted}>الرصيد: {open.count}</p>
        {!people ? (
          <p role="status">جارٍ التحميل…</p>
        ) : (
          <div className="invites-wrap">
            <table className="invites-table">
              <thead>
                <tr>
                  <th>رقم العضو</th>
                  <th>الاسم</th>
                  <th>الجوال</th>
                  <th>الحساب</th>
                  <th>عن طريق</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.memberNo}>
                    <td>
                      <strong dir="ltr">{p.memberNo}</strong>
                      <small className="member-internal" dir="ltr">
                        {p.internalNo}
                      </small>
                    </td>
                    <td>{p.name}</td>
                    <td dir="ltr">{p.phone}</td>
                    <td>{ROLE[p.role] ?? p.role}</td>
                    <td>
                      {p.via === "link"
                        ? "رابط الدعوة"
                        : p.via === "number"
                          ? "كتب رقم العضو"
                          : "كتب الجوال"}
                    </td>
                    <td>{when(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  return (
    <section aria-labelledby="invites-title">
      <h2 id="invites-title" className="sr-only">
        دعوات الأصدقاء
      </h2>
      <p className={forms.muted}>
        كل عضو دعا أحدًا، ورصيده: عدد من سجلوا عن طريقه وأكدوا جوالاتهم (بالرابط
        أو بكتابة رقمه). اضغط الاسم لترى من سجلوا.
      </p>
      {!rows.length ? (
        <p className={forms.notice}>لم يسجل أحد عن طريق دعوة بعد.</p>
      ) : (
        <div className="invites-wrap">
          <table className="invites-table">
            <thead>
              <tr>
                <th>رقم العضو</th>
                <th>الاسم</th>
                <th>الرصيد</th>
                <th>بالرابط</th>
                <th>برقمه</th>
                <th>آخر تسجيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong dir="ltr">{r.memberNo}</strong>
                    <small className="member-internal" dir="ltr">
                      {r.internalNo}
                    </small>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="invites-name"
                      onClick={() => setOpen(r)}
                    >
                      {r.name}
                    </button>
                  </td>
                  <td>
                    <strong>{r.count}</strong>
                  </td>
                  <td>{r.byLink}</td>
                  <td>{r.byNumber}</td>
                  <td>{when(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
