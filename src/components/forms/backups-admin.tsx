"use client";
import { useEffect, useState } from "react";
import { Message, api, s } from "./shared";
import r from "./security-report.module.css";

type Backup = {
  file: string;
  createdAt: string;
  sizeBytes: number;
  databaseBytes: number;
  mediaBytes: number;
  sha256: string | null;
  downloadable: boolean;
};
type Data = {
  backups: Backup[];
  downloadEnabled: boolean;
  latestAt: string | null;
};
const size = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} ج.ب`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} م.ب`
      : `${Math.max(1, Math.round(n / 1024))} ك.ب`;
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

/**
 * الإدارة ← التقارير ← «النسخ الاحتياطية»: كل نسخة وما تحتويه (قاعدة البيانات والوسائط)
 * وحجمها وتحميلها. الكود ليس في هذه النسخ؛ محفوظ في GitHub مع فرع احتياطي قبل كل نشر.
 */
export function BackupsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Data>("/api/admin/backups")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  const hoursSince = data?.latestAt
    ? (Date.now() - Date.parse(data.latestAt)) / 3600_000
    : null;
  return (
    <section aria-label="النسخ الاحتياطية" className={r.report}>
      <h2>النسخ الاحتياطية</h2>
      <p className={s.muted}>
        يأخذ الخادم نسخة يوميًا وقبل كل نشر، ويتحقق من سلامتها. كل نسخة ملف واحد
        مشفّر يضم نوعين: <strong>البيانات</strong> (قاعدة البيانات والإعدادات) و
        <strong>الميديا</strong> (الصور والمستندات والتسجيلات).
      </p>
      <Message error={error} />
      {!data && !error && <p role="status">جارٍ تحميل النسخ…</p>}
      {data && (
        <>
          <ul className={r.cards} aria-label="ملخص النسخ">
            <li
              className={
                hoursSince === null || hoursSince > 36 ? r.alert : r.ok
              }
            >
              <strong>{data.latestAt ? when(data.latestAt) : "لا توجد"}</strong>
              <span>آخر نسخة</span>
            </li>
            <li>
              <strong>{data.backups.length}</strong>
              <span>نسخ محفوظة</span>
            </li>
            <li>
              <strong>
                {size(data.backups.reduce((n, b) => n + b.sizeBytes, 0))}
              </strong>
              <span>الحجم الكلي</span>
            </li>
          </ul>
          {hoursSince !== null && hoursSince > 36 && (
            <p role="alert" className={s.error}>
              آخر نسخة مضى عليها أكثر من 36 ساعة. تحقق من خدمة النسخ على الخادم.
            </p>
          )}
          {data.backups.length ? (
            <div className={r.tableWrap}>
              <table className={r.table} aria-label="النسخ">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع وما تحتويه</th>
                    <th>الحجم</th>
                    <th>الملف</th>
                    <th>التحميل</th>
                  </tr>
                </thead>
                <tbody>
                  {data.backups.map((b) => (
                    <tr key={b.file}>
                      <td>{when(b.createdAt)}</td>
                      <td>
                        <span className={`${r.badge} ${r.success}`}>
                          بيانات: {size(b.databaseBytes)}
                        </span>{" "}
                        <span className={`${r.badge} ${r.failed}`}>
                          ميديا: {size(b.mediaBytes)}
                        </span>
                      </td>
                      <td className={r.count}>{size(b.sizeBytes)}</td>
                      <td dir="ltr" className={r.mono}>
                        {b.file}
                      </td>
                      <td>
                        {b.downloadable ? (
                          <a
                            className={r.refresh}
                            href={`/api/admin/backups/${encodeURIComponent(b.file)}`}
                            download={b.file}
                          >
                            تحميل
                          </a>
                        ) : (
                          <span className={r.muted}>
                            {data.downloadEnabled
                              ? "حُذفت من الخادم"
                              : "من الخادم فقط"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.notice}>
              لم يُسجَّل أي نسخة هنا بعد. يظهر السجل بعد أول نسخة يأخذها الخادم
              بسكربت النسخ المحدَّث.
            </p>
          )}
          <p className={r.note}>
            <strong>الكود:</strong> ليس ضمن هذه النسخ؛ محفوظ كاملًا في GitHub،
            ويُنشأ فرع احتياطي (backup/before-…) قبل كل نشر.{" "}
            <strong>التشفير:</strong> الملف مشفّر (AES-256) ولا يُفتح إلا بمفتاح
            محفوظ على الخادم وحده، فاحتفظ بنسخة من المفتاح خارج الخادم. كل تحميل
            يُسجَّل في سجل الإدارة.
            {!data.downloadEnabled &&
              " التحميل من الموقع غير مفعّل بعد: يحتاج ربط مجلد النسخ بالتطبيق للقراءة على الخادم."}
          </p>
        </>
      )}
    </section>
  );
}
