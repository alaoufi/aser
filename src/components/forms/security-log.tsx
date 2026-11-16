"use client";
import { useEffect, useState } from "react";
import { Message, api, s } from "./shared";

type Kind =
  | "login.failed"
  | "login.admin"
  | "otp.failed"
  | "rate_limited"
  | "access.denied"
  | "origin.rejected";
const kindLabels: Record<Kind, string> = {
  "login.failed": "دخول فاشل",
  "login.admin": "دخول حساب إدارة",
  "otp.failed": "رمز تحقق خاطئ",
  rate_limited: "تجاوز حد المحاولات",
  "access.denied": "رفض دخول قسم إدارة",
  "origin.rejected": "طلب من مصدر غير مسموح",
};
type Overview = {
  summary: { kind: Kind; count: number }[];
  suspicious: {
    by: "source" | "account";
    key: string;
    count: number;
    lastAt: string;
  }[];
  events: {
    id: string;
    kind: Kind;
    source: string | null;
    subject: string | null;
    detail: string | null;
    createdAt: string;
    userName: string | null;
  }[];
};
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

/** الإدارة ← «سجل الأمان»: ملخص 24 ساعة، والمصادر المشبوهة، وآخر 100 حدث. */
export function SecurityLog() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Overview>("/api/admin/security")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <section aria-label="سجل الأمان">
      <h2>سجل الأمان</h2>
      <p className={s.muted}>
        محاولات الدخول الفاشلة، ورموز التحقق الخاطئة، وتجاوز حدود المحاولات،
        والرفض في أقسام الإدارة، ودخول حسابات الإدارة. العناوين والحسابات مموّهة
        برمز ثابت يكفي لمعرفة تكرارها، ويُحذف السجل بعد 90 يومًا. يصلك إشعار إن
        تجاوزت المحاولات الفاشلة 50 خلال 10 دقائق.
      </p>
      <Message error={error} />
      {!data && !error && <p role="status">جارٍ تحميل السجل…</p>}
      {data && (
        <>
          <h3>آخر 24 ساعة</h3>
          {data.summary.length ? (
            <ul className={s.securitySummary} aria-label="ملخص آخر 24 ساعة">
              {data.summary.map((r) => (
                <li key={r.kind}>
                  <strong>{r.count}</strong> {kindLabels[r.kind]}
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.notice}>لا أحداث أمنية خلال آخر 24 ساعة ✓</p>
          )}
          <h3>مصادر مشبوهة (5 محاولات فاشلة أو أكثر خلال ساعة)</h3>
          {data.suspicious.length ? (
            <ul aria-label="مصادر مشبوهة">
              {data.suspicious.map((r) => (
                <li key={r.by + r.key}>
                  {r.by === "source" ? "عنوان" : "حساب"}{" "}
                  <bdi dir="ltr">{r.key}</bdi>: {r.count} محاولة، آخرها{" "}
                  {when(r.lastAt)}
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.notice}>لا مصادر مشبوهة الآن ✓</p>
          )}
          <h3>آخر الأحداث</h3>
          {data.events.length ? (
            <div className={s.tableWrap}>
              <table aria-label="آخر الأحداث الأمنية">
                <thead>
                  <tr>
                    <th>الوقت</th>
                    <th>الحدث</th>
                    <th>التفاصيل</th>
                    <th>العنوان</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id}>
                      <td>{when(e.createdAt)}</td>
                      <td>{kindLabels[e.kind]}</td>
                      <td>
                        {[e.userName, e.detail].filter(Boolean).join(" · ")}
                      </td>
                      <td>
                        <bdi dir="ltr">{e.source ?? "—"}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.muted}>لا أحداث مسجلة بعد.</p>
          )}
        </>
      )}
    </section>
  );
}
