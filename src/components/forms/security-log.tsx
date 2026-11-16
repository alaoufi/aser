"use client";
import { useEffect, useMemo, useState } from "react";
import { Message, api } from "./shared";
import r from "./security-report.module.css";

type Status = "failed" | "blocked" | "success";
type Kind =
  | "login.failed"
  | "login.admin"
  | "otp.failed"
  | "rate_limited"
  | "access.denied"
  | "origin.rejected"
  | "login.locked"
  | "login.while_locked";
type Report = {
  range: { from: string; to: string; days: number };
  cards: {
    attempts: number;
    sources: number;
    countries: number;
    perDay: number;
    loginFailed: number;
    otpFailed: number;
    rateLimited: number;
    denied: number;
    locked: number;
    adminLogins: number;
  };
  daily: { day: string; failed: number; blocked: number }[];
  topCountries: { code: string; count: number }[];
  topIps: { ip: string; count: number; code: string | null }[];
  events: {
    at: string;
    kind: Kind;
    status: Status;
    ip: string | null;
    code: string | null;
    attempts: number;
    detail: string | null;
  }[];
};
const kindLabels: Record<Kind, string> = {
  "login.failed": "دخول بكلمة مرور خاطئة",
  "otp.failed": "رمز تحقق خاطئ",
  rate_limited: "تجاوز حد المحاولات",
  "access.denied": "محاولة دخول قسم إدارة",
  "origin.rejected": "طلب من موقع آخر",
  "login.locked": "قفل حساب بعد 5 محاولات خاطئة",
  "login.while_locked": "دخول إلى حساب مقفل",
  "login.admin": "دخول حساب إدارة",
};
const statusLabels: Record<Status, string> = {
  failed: "فشل",
  blocked: "محظور",
  success: "نجح",
};
const riyadhToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
const shift = (day: string, by: number) =>
  new Date(Date.parse(day) + by * 86400_000).toISOString().slice(0, 10);
const countryName = (() => {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["ar"], { type: "region" });
  } catch {
    names = null;
  }
  return (code: string) => names?.of(code) ?? code;
})();
/** العلم من رمز الدولة (حروف المناطق في يونيكود). */
const flag = (code: string) =>
  String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
const num = (n: number) => n.toLocaleString("en-US");
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));
const ago = (at: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 48) return `قبل ${h} ساعة`;
  return `قبل ${Math.round(h / 24)} يوم`;
};

/**
 * الإدارة ← «التقرير الأمني»: محاولات اختراق الموقع في فترة تختارها، ببطاقات ملخص ورسم
 * يومي وأكثر الدول والعناوين هجومًا وجدول الأحداث. الدولة محليًا من قاعدة DB-IP.
 */
export function SecurityLog() {
  const [preset, setPreset] = useState<number | "custom">(7);
  const [to, setTo] = useState(riyadhToday);
  const [from, setFrom] = useState(() => shift(riyadhToday(), -6));
  const [status, setStatus] = useState<"all" | Status>("all");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState(50);
  useEffect(() => {
    setBusy(true);
    const q = new URLSearchParams({ from, to, status });
    api<Report>(`/api/admin/security?${q}`)
      .then((d) => {
        setData(d);
        setShown(50);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [from, to, status, tick]);
  const pick = (days: number) => {
    const today = riyadhToday();
    setPreset(days);
    setTo(today);
    setFrom(shift(today, -(days - 1)));
  };
  const peak = useMemo(
    () => Math.max(1, ...(data?.daily ?? []).map((d) => d.failed + d.blocked)),
    [data],
  );
  const topCountry = data?.topCountries[0]?.count ?? 1;
  const c = data?.cards;
  const cards: [string, number | undefined, string?][] = [
    ["إجمالي محاولات الاختراق", c?.attempts, "alert"],
    ["عناوين مهاجمة", c?.sources],
    ["دول", c?.countries],
    ["متوسط المحاولات يوميًا", c?.perDay],
    ["دخول فاشل بكلمة مرور", c?.loginFailed, "warn"],
    ["رموز تحقق خاطئة", c?.otpFailed, "warn"],
    ["تجاوز حد المحاولات", c?.rateLimited, "alert"],
    ["رفض دخول الإدارة أو مصدر غريب", c?.denied, "alert"],
    ["حسابات قُفلت", c?.locked, "alert"],
    ["دخول الإدارة الناجح", c?.adminLogins, "ok"],
  ];
  return (
    <section aria-label="التقرير الأمني" className={r.report}>
      <h2>التقرير الأمني</h2>
      <div className={r.controls}>
        <div className={r.presets} role="group" aria-label="الفترة">
          {(
            [
              [1, "اليوم"],
              [7, "7 أيام"],
              [30, "30 يومًا"],
              [90, "90 يومًا"],
            ] as const
          ).map(([days, label]) => (
            <button
              key={days}
              type="button"
              aria-pressed={preset === days}
              onClick={() => pick(days)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          من
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setPreset("custom");
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          إلى
          <input
            type="date"
            value={to}
            min={from}
            max={riyadhToday()}
            onChange={(e) => {
              setPreset("custom");
              setTo(e.target.value);
            }}
          />
        </label>
        <label>
          الحالة
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">الكل</option>
            <option value="failed">فشل</option>
            <option value="blocked">محظور</option>
            <option value="success">نجح</option>
          </select>
        </label>
        <button
          type="button"
          className={r.refresh}
          onClick={() => setTick((t) => t + 1)}
          disabled={busy}
        >
          ↻ تحديث
        </button>
      </div>
      {data && (
        <p className={r.range}>
          الفترة من <bdi>{data.range.from}</bdi> إلى <bdi>{data.range.to}</bdi>{" "}
          ({data.range.days} يوم)
        </p>
      )}
      <Message error={error} />
      {!data && !error && <p role="status">جارٍ تحميل التقرير…</p>}
      {data && (
        <>
          <ul className={r.cards} aria-label="ملخص الفترة">
            {cards.map(([label, value, tone]) => (
              <li key={label} className={tone ? r[tone] : undefined}>
                <strong>{num(value ?? 0)}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>

          <figure className={r.panel} aria-label="المحاولات يوميًا">
            <figcaption>
              <strong>المحاولات يوميًا</strong>
              <span className={r.legend}>
                <i className={r.failedDot} /> فشل
                <i className={r.blockedDot} /> محظور
              </span>
            </figcaption>
            <div className={r.chart}>
              {data.daily.map((d) => {
                const total = d.failed + d.blocked;
                return (
                  <div
                    key={d.day}
                    className={r.bar}
                    title={`${d.day}: فشل ${d.failed} · محظور ${d.blocked}`}
                  >
                    <span
                      className={r.blocked}
                      style={{ height: `${(d.blocked / peak) * 100}%` }}
                    />
                    <span
                      className={r.failed}
                      style={{ height: `${(d.failed / peak) * 100}%` }}
                    />
                    <span className="sr-only">
                      {d.day}: {total} محاولة
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={r.axis} aria-hidden="true">
              <span>{data.daily.at(-1)?.day}</span>
              <span>{data.daily[0]?.day}</span>
            </div>
          </figure>

          <div className={r.split}>
            <section className={r.panel} aria-label="أكثر الدول هجومًا">
              <strong>أكثر الدول هجومًا</strong>
              {data.topCountries.length ? (
                <ol className={r.countries}>
                  {data.topCountries.map((x) => (
                    <li key={x.code}>
                      <span>
                        <span aria-hidden="true">{flag(x.code)}</span>{" "}
                        {countryName(x.code)}
                      </span>
                      <b>{num(x.count)}</b>
                      <i
                        style={{ width: `${(x.count / topCountry) * 100}%` }}
                        aria-hidden="true"
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={r.muted}>لا بيانات دول لهذه الفترة.</p>
              )}
            </section>
            <section className={r.panel} aria-label="أكثر العناوين هجومًا">
              <strong>أكثر العناوين هجومًا</strong>
              {data.topIps.length ? (
                <table className={r.table}>
                  <tbody>
                    {data.topIps.map((x) => (
                      <tr key={x.ip}>
                        <td dir="ltr" className={r.mono}>
                          {x.ip}
                        </td>
                        <td>
                          {x.code
                            ? `${flag(x.code)} ${countryName(x.code)}`
                            : "غير معروفة"}
                        </td>
                        <td className={r.count}>{num(x.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={r.muted}>لا محاولات في هذه الفترة ✓</p>
              )}
            </section>
          </div>

          <div className={r.tableWrap}>
            <table className={r.table} aria-label="الأحداث">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>الحدث</th>
                  <th>الحالة</th>
                  <th>IP</th>
                  <th>الدولة</th>
                  <th>المحاولات</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {data.events.slice(0, shown).map((e) => (
                  <tr key={`${e.at}-${e.kind}-${e.ip}`}>
                    <td>
                      {when(e.at)}
                      <small className={r.muted}>{ago(e.at)}</small>
                    </td>
                    <td>
                      <small className={r.muted}>الموقع</small>
                      {kindLabels[e.kind]}
                    </td>
                    <td>
                      <span className={`${r.badge} ${r[e.status]}`}>
                        {statusLabels[e.status]}
                      </span>
                    </td>
                    <td dir="ltr" className={r.mono}>
                      {e.ip ?? "—"}
                    </td>
                    <td>
                      {e.code
                        ? `${flag(e.code)} ${countryName(e.code)}`
                        : "غير معروفة"}
                    </td>
                    <td className={r.count}>{e.attempts}</td>
                    <td>{e.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.events.length && (
              <p className={r.muted}>لا أحداث في هذه الفترة ✓</p>
            )}
            {data.events.length > shown && (
              <button
                type="button"
                className={r.refresh}
                onClick={() => setShown((n) => n + 50)}
              >
                عرض المزيد ({data.events.length - shown})
              </button>
            )}
          </div>
          <p className={r.note}>
            يعرض محاولات دخول هذا الموقع. محاولات دخول الخادم (SSH) تخص الخادم
            كله وتظهر في تقرير الخادم. العناوين تُحفظ 90 يومًا لأغراض الأمان
            فقط، والدولة تُحدَّد محليًا دون إرسال أي عنوان لجهة خارجية.{" "}
            <a href="https://db-ip.com" rel="noopener noreferrer">
              IP Geolocation by DB-IP
            </a>
          </p>
        </>
      )}
    </section>
  );
}
