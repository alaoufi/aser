"use client";
import { useEffect, useState } from "react";
import { Message, api, s } from "./shared";
import r from "./security-report.module.css";

type Kind = "full" | "media" | "codedb";
const kinds: [Kind, string, string][] = [
  [
    "codedb",
    "الكود مع قاعدة البيانات",
    "مصدر الإصدار المنشور وقاعدة البيانات كاملة",
  ],
  ["media", "الصور والمستندات", "صور المنتجات والمستندات والتسجيلات الصوتية"],
  [
    "full",
    "نسخة كاملة",
    "قاعدة البيانات والإعدادات والصور معًا، كالنسخة اليومية",
  ],
];
const kindLabel: Record<Kind | "daily", string> = {
  daily: "يومية (5:00 فجرًا)",
  full: "كاملة (نشر أو يدوية)",
  media: "صور ومستندات",
  codedb: "كود وقاعدة بيانات",
};
type Backup = {
  file: string;
  kind: Kind | "daily";
  createdAt: string;
  sizeBytes: number;
  databaseBytes: number;
  mediaBytes: number;
  codeBytes: number;
  sha256: string | null;
  remote: boolean;
  onServer: boolean;
  downloadable: boolean;
};
type Request = {
  id: string;
  kind: Kind;
  status: "pending" | "running" | "done" | "failed";
  requestedAt: string;
  finishedAt: string | null;
  file: string | null;
  error: string | null;
};
type Data = {
  backups: Backup[];
  requests: Request[];
  remoteReady: boolean;
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

const contents: Record<Kind | "daily", string> = {
  daily: "قاعدة البيانات، الإعدادات، الصور والمستندات",
  full: "قاعدة البيانات، الإعدادات، الصور والمستندات",
  media: "الصور والمستندات والتسجيلات",
  codedb: "كود الإصدار المنشور وقاعدة البيانات",
};

/**
 * أمر الاستعادة الجاهز لنسخة (قرار المالك 2026-11-21): يُنسخ ويُشغَّل على الخادم. السكربت يأخذ
 * نسخة من الوضع الحالي أولًا، ويطلب كتابة «استعادة»، ويستعيد القاعدة في معاملة واحدة.
 * لا زر استعادة في الموقع: الاستعادة تستبدل البيانات الحية.
 */
function RestoreCommand({ file }: { file: string }) {
  const [copied, setCopied] = useState(false);
  const command = `ssh -t root@84.247.166.216 "bash /opt/jdatna/infra/backup-restore.sh ${file}"`;
  return (
    <details className={r.restore}>
      <summary>أمر الاستعادة</summary>
      <p className={r.muted}>
        يأخذ نسخة من الوضع الحالي أولًا، ثم يطلب كتابة «استعادة». كل ما أُضيف
        بعد تاريخ هذه النسخة يُزال من الموقع (ويبقى في نسخة الأمان).
      </p>
      <code dir="ltr" className={r.mono}>
        {command}
      </code>
      <button
        type="button"
        className={r.refresh}
        onClick={() =>
          navigator.clipboard
            ?.writeText(command)
            .then(() => setCopied(true))
            .catch(() => {})
        }
      >
        {copied ? "نُسخ ✓" : "نسخ الأمر"}
      </button>
    </details>
  );
}

/**
 * الإدارة ← التقارير ← «النسخ الاحتياطية»: كل نسخة وما تحتويه (قاعدة البيانات والوسائط)
 * وحجمها وتحميلها. الكود ليس في هذه النسخ؛ محفوظ في GitHub مع فرع احتياطي قبل كل نشر.
 */
export function BackupsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<Kind>("codedb");
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<Data>("/api/admin/backups")
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    void load();
  }, []);
  const open = data?.requests.find(
    (q) => q.status === "pending" || q.status === "running",
  );
  // أثناء تنفيذ نسخة: يتحدّث التقرير كل 10 ثوانٍ حتى تنتهي.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [open?.id]);
  async function take() {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<Data>("/api/admin/backups", {
          method: "POST",
          body: JSON.stringify({ kind }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const last = data?.requests[0];
  const hoursSince = data?.latestAt
    ? (Date.now() - Date.parse(data.latestAt)) / 3600_000
    : null;
  return (
    <section aria-label="النسخ الاحتياطية" className={r.report}>
      <h2>النسخ الاحتياطية</h2>
      <p className={s.muted}>
        يأخذ الخادم نسخة <strong>يومية الساعة 5:00 فجرًا بتوقيت الرياض</strong>{" "}
        ويحفظ آخر 10 منها (الأحدث تحل محل الأقدم)، ونسخة قبل كل نشر وبعده يحفظ
        آخر 5 منها. يتحقق من سلامة كل نسخة. كل نسخة ملف واحد مشفّر يضم{" "}
        <strong>البيانات</strong> (قاعدة البيانات والإعدادات) و
        <strong>الميديا</strong> (الصور والمستندات والتسجيلات).
      </p>
      <Message error={error} />
      {!data && !error && <p role="status">جارٍ تحميل النسخ…</p>}
      {data && (
        <>
          <form
            className={r.panel}
            aria-label="خذ نسخة الآن"
            onSubmit={(e) => {
              e.preventDefault();
              void take();
            }}
          >
            <fieldset className={s.lookChoices}>
              <legend>
                <strong>خذ نسخة الآن</strong>
              </legend>
              {kinds.map(([id, label, hint]) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === id}
                    onChange={() => setKind(id)}
                  />{" "}
                  <strong>{label}</strong>
                  <small className={r.muted}> — {hint}</small>
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className={s.button}
              disabled={busy || Boolean(open)}
            >
              {open ? "جارٍ أخذ النسخة…" : "خذ نسخة الآن"}
            </button>
            {open && (
              <p role="status" className={s.notice}>
                طلبك «{kindLabel[open.kind]}»{" "}
                {open.status === "pending"
                  ? "بانتظار الخادم (يبدأ خلال دقيقة)."
                  : "قيد التنفيذ على الخادم."}{" "}
                تظهر النسخة في الجدول عند اكتمالها.
              </p>
            )}
            {!open && last?.status === "done" && (
              <p role="status" className={s.notice}>
                تم ✓ آخر نسخة طلبتها «{kindLabel[last.kind]}» اكتملت{" "}
                {last.finishedAt ? when(last.finishedAt) : ""}.
              </p>
            )}
            {!open && last?.status === "failed" && (
              <p role="alert" className={s.error}>
                تعذّر أخذ آخر نسخة طلبتها «{kindLabel[last.kind]}»
                {last.error ? `: ${last.error}` : "."}
              </p>
            )}
          </form>
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
                        <strong>{kindLabel[b.kind]}</strong>
                        <br />
                        <small className={r.muted}>{contents[b.kind]}</small>
                        <br />
                        {b.codeBytes > 0 && (
                          <span className={`${r.badge} ${r.blocked}`}>
                            كود: {size(b.codeBytes)}
                          </span>
                        )}{" "}
                        {b.databaseBytes > 0 && (
                          <span className={`${r.badge} ${r.success}`}>
                            بيانات: {size(b.databaseBytes)}
                          </span>
                        )}{" "}
                        {b.mediaBytes > 0 && (
                          <span className={`${r.badge} ${r.failed}`}>
                            ميديا: {size(b.mediaBytes)}
                          </span>
                        )}
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
                        <small className={r.muted}>
                          {b.remote ? "مرفوعة إلى R2 ✓" : "على الخادم فقط"}
                        </small>
                        {b.onServer &&
                          (b.kind === "daily" || b.kind === "full") && (
                            <RestoreCommand file={b.file} />
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
            <strong>التشفير:</strong> كل ملف مشفّر (AES-256) ولا يُفتح إلا
            بمفتاح محفوظ على الخادم وحده، فاحتفظ بنسخة من المفتاح خارج الخادم؛
            بدونه لا تُسترجع أي نسخة. <strong>الكود</strong> محفوظ كذلك في
            GitHub مع فرع احتياطي قبل كل نشر. كل طلب نسخة وكل تحميل يُسجَّل في
            سجل الإدارة.
            {!data.remoteReady &&
              " التخزين الخارجي (R2) غير مهيأ في الموقع بعد، فالتحميل منه غير متاح."}
          </p>
        </>
      )}
    </section>
  );
}
