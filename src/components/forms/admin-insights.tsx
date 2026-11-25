"use client";
import { useEffect, useRef, useState } from "react";
import type { AdminInsights as Data } from "@/server/insights";
import { api, useSession } from "./session";
import c from "./admin-insights.module.css";

/**
 * إحصاءات الإدارة الرئيسية (طلب المالك 2026-11-25): مربعات مفصّلة مع المقارنة بالفترة السابقة،
 * وتوزيع الطلبات، والأفضل، وفرص التسويق، وتوقع الأسابيع الأربعة القادمة. «تصدير PDF» يطبع
 * هذا القسم وحده من المتصفح (حفظ بصيغة PDF)، فتبقى العربية والاتجاه سليمين.
 */
const RANGES: [number, string][] = [
  [7, "7 أيام"],
  [30, "30 يومًا"],
  [90, "90 يومًا"],
  [365, "سنة"],
];
const MEALS: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "مناسبة",
};
const DAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  maximumFractionDigits: 1,
});
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(v);
const sar = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${nf.format(Math.round(v))} ر.س`;
const hourLabel = (h: number) =>
  `من ${String(h).padStart(2, "0")}:00 إلى ${String(h + 3).padStart(2, "0")}:00`;

type Row = { label: string | number; value: number; amount?: number };

/** الفرق عن الفترة السابقة: سهم ونص، لا لون وحده. */
function Delta({
  now,
  before,
  lowerIsBetter,
}: {
  now: number | null;
  before: number | null;
  lowerIsBetter?: boolean;
}) {
  if (now === null || before === null) return null;
  if (!before)
    return now ? (
      <small className={c.deltaNew}>جديد في هذه الفترة</small>
    ) : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return <small className={c.deltaFlat}>بلا تغيير</small>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <small className={good ? c.deltaUp : c.deltaDown}>
      {pct > 0 ? "▲" : "▼"} {nf.format(Math.abs(pct))}٪ عن الفترة السابقة
    </small>
  );
}

function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={c.tile} data-tile>
      <span className={c.tileLabel}>{label}</span>
      <strong className={c.tileValue}>{value}</strong>
      {hint && <small className={c.tileHint}>{hint}</small>}
      {children}
    </div>
  );
}

/** أعمدة أفقية لقائمة صغيرة: الاسم والعدد ظاهران، والطول للمقارنة فقط. */
function Bars({
  title,
  rows,
  label = (r) => String(r.label),
  empty = "لا بيانات في هذه الفترة",
}: {
  title: string;
  rows: Row[];
  label?: (r: Row) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className={c.card}>
      <figcaption className={c.cardTitle}>{title}</figcaption>
      {rows.length === 0 ? (
        <p className={c.empty}>{empty}</p>
      ) : (
        <ul className={c.bars}>
          {rows.map((r) => (
            <li key={String(r.label)} title={`${label(r)}: ${num(r.value)}`}>
              <span className={c.barName}>{label(r)}</span>
              <span className={c.barTrack} aria-hidden="true">
                <span
                  className={c.barFill}
                  style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
                />
              </span>
              <span className={c.barValue}>
                {num(r.value)}
                {r.amount ? <small> · {sar(r.amount)}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** أعمدة أسبوعية لسلسلة واحدة (12 أسبوعًا)، مع جدول لقارئ الشاشة. */
function Weekly({
  title,
  weeks,
  pick,
}: {
  title: string;
  weeks: Data["weekly"];
  pick: (w: Data["weekly"][number]) => number;
}) {
  const max = Math.max(1, ...weeks.map(pick));
  const last = weeks.at(-1);
  return (
    <figure className={c.card}>
      <figcaption className={c.cardTitle}>
        {title}
        {last && (
          <small className={c.muted}>
            {" "}
            · الأسبوع الجاري حتى الآن: {num(pick(last))}
          </small>
        )}
      </figcaption>
      <div className={c.columns} aria-hidden="true">
        {weeks.map((w, i) => (
          <span
            key={w.week}
            className={`${c.column} ${i === weeks.length - 1 ? c.columnNow : ""}`}
            title={`أسبوع ${w.week}: ${num(pick(w))}`}
          >
            <span
              style={{ height: `${Math.max(2, (pick(w) / max) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <div className={c.columnAxis} aria-hidden="true">
        <span>{weeks[0]?.week}</span>
        <span>{weeks.at(-1)?.week}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <th scope="row">أسبوع {w.week}</th>
              <td>{pick(w)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** توصيات تسويقية مستخرجة من الأرقام نفسها، بلا افتراضات. */
function tips(d: Data) {
  const out: string[] = [];
  const topDay = [...d.breakdowns.weekdays].sort(
    (a, b) => b.value - a.value,
  )[0];
  if (topDay)
    out.push(
      `أكثر يوم طلبًا: ${DAYS[Number(topDay.label)]}. انشر العروض والإعلانات قبله بيوم.`,
    );
  const topHour = [...d.breakdowns.hours].sort((a, b) => b.value - a.value)[0];
  if (topHour)
    out.push(
      `ذروة الطلب ${hourLabel(Number(topHour.label))} بتوقيت الرياض: وقت مناسب للإشعارات.`,
    );
  const topCat = d.breakdowns.categories[0];
  if (topCat)
    out.push(
      `القسم الأكثر طلبًا: ${topCat.label}. أبرزه في الرئيسية والإعلانات.`,
    );
  const wanted = d.demand.categories[0];
  if (wanted)
    out.push(
      `العملاء يطلبون «${wanted.label}» في «طلبات العملاء» (${num(wanted.value)}): استقطب أسرًا تقدّمه.`,
    );
  for (const g of d.demand.gaps.slice(0, 2))
    out.push(
      `منطقة ${g.label} فيها طلبات عملاء ولا أسرة معتمدة: فرصة لتسجيل أسر هناك.`,
    );
  if (d.repeatRate !== null && d.repeatRate < 30)
    out.push(
      `العملاء العائدون ${num(d.repeatRate)}٪ فقط: عروض للعميل بعد طلبه الأول ترفع التكرار.`,
    );
  if (d.current.responseHours !== null && Number(d.current.responseHours) > 3)
    out.push(
      `متوسط رد الأسر ${num(d.current.responseHours)} ساعة: تذكير الأسر بالرد السريع يرفع الإتمام.`,
    );
  return out;
}

/** ملخص نصي لواتساب: أهم الأرقام والتوقع والتوصيات. */
function summaryText(d: Data, period: string) {
  const cur = d.current;
  const lines = [
    `*أكلات جدتنا — ملخص الإحصاءات (آخر ${period})*`,
    "",
    `الطلبات: ${num(cur.orders)} (المكتملة ${num(cur.completed)})`,
    `القيمة التقديرية: ${sar(cur.value)} · متوسط الطلب ${sar(d.averageValue)}`,
    `عملاء طلبوا: ${num(cur.customers)} · العائدون ${d.repeatRate === null ? "—" : `${num(d.repeatRate)}٪`}`,
    `أعضاء جدد: ${num(cur.members)} · أسر جديدة: ${num(cur.families)}`,
    `متوسط رد الأسرة: ${cur.responseHours === null ? "—" : `${num(cur.responseHours)} ساعة`}`,
    "",
    "*التوقع للأسابيع الأربعة القادمة (تقدير):*",
    `طلبات ${num(d.forecast.orders)} · أعضاء ${num(d.forecast.members)} · قيمة ${sar(d.forecast.value)}`,
  ];
  const t = tips(d);
  if (t.length) lines.push("", "*توصيات:*", ...t.map((x) => `• ${x}`));
  return lines.join("\n");
}

export function AdminInsights() {
  const box = useRef<HTMLElement>(null);
  const [sharing, setSharing] = useState("");
  const { user } = useSession();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const allowed = user?.role === "admin";
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    setError("");
    api<Data>(`/api/admin/insights?days=${days}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [days, allowed]);
  useEffect(() => {
    const done = () => document.body.classList.remove("print-insights");
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  if (!allowed) return null;
  const d = data?.days === days ? data : null;
  const cur = d?.current;
  const prev = d?.previous;
  const rate = (x?: Data["current"]) =>
    x && Number(x.orders) - Number(x.lost) > 0
      ? Math.round((Number(x.completed) / Number(x.orders)) * 100)
      : null;
  const period = RANGES.find(([n]) => n === days)?.[1] ?? "";
  function exportPdf() {
    document.body.classList.add("print-insights");
    window.print();
  }
  function sendWhatsApp() {
    if (!d) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(summaryText(d, period))}`,
      "_blank",
      "noopener",
    );
  }
  /**
   * ملف PDF للمشاركة: صورة القسم بصفحات A4 (تُحمَّل المكتبتان عند الضغط فقط).
   * الجوال: قائمة المشاركة (واتساب وغيره). الكمبيوتر: يُحفظ الملف ليُرفق في واتساب.
   */
  async function sharePdf() {
    const el = box.current;
    if (!el || !d) return;
    setSharing("جارٍ تجهيز الملف…");
    el.classList.add(c.capturing);
    try {
      const [{ toCanvas }, { jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      // كل جزء يُصوَّر وحده ويوضع في الصفحة كاملًا (لا يُقسم مربع بين صفحتين).
      const parts = [...el.children].filter(
        (n): n is HTMLElement =>
          n instanceof HTMLElement &&
          !n.dataset.noCapture &&
          n.tagName !== "HEADER" &&
          n.getAttribute("role") !== "status",
      );
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210,
        pageH = 297,
        margin = 10,
        gap = 3;
      const w = pageW - margin * 2;
      let y = margin;
      const full = pageH - margin * 2;
      const shots: { url: string; w: number; h: number; keep: boolean }[] = [];
      for (const part of parts) {
        const canvas = await toCanvas(part, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        });
        if (!canvas.width || !canvas.height) continue;
        // جزء أطول من الصفحة (على الجوال) يُصغَّر ليدخل صفحة واحدة.
        let h = (canvas.height / canvas.width) * w;
        let pw = w;
        if (h > full) {
          pw = (w * full) / h;
          h = full;
        }
        shots.push({
          url: canvas.toDataURL("image/jpeg", 0.92),
          w: pw,
          h,
          // العنوان وسطر الشرح يبقيان مع ما بعدهما في الصفحة نفسها.
          keep: part.tagName === "H3" || part.tagName === "P",
        });
      }
      for (let i = 0; i < shots.length; i++) {
        let need = shots[i].h;
        for (let j = i; shots[j]?.keep && shots[j + 1]; j++)
          need += gap + shots[j + 1].h;
        if (y + Math.min(need, full) > pageH - margin && y > margin) {
          pdf.addPage();
          y = margin;
        }
        const shot = shots[i];
        pdf.addImage(
          shot.url,
          "JPEG",
          margin + (w - shot.w),
          y,
          shot.w,
          shot.h,
        );
        y += shot.h + gap;
      }
      const name = `jdatna-insights-${days}d-${d.generatedAt.slice(0, 10)}.pdf`;
      const file = new File([pdf.output("blob")], name, {
        type: "application/pdf",
      });
      if (navigator.canShare?.({ files: [file] })) {
        setSharing("");
        await navigator
          .share({ files: [file], title: "تقرير إحصاءات أكلات جدتنا" })
          .catch(() => {});
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setSharing("حُفظ ملف PDF في جهازك؛ أرفقه في محادثة واتساب.");
      }
    } catch {
      setSharing("تعذر تجهيز الملف؛ استخدم «تصدير PDF».");
    } finally {
      el.classList.remove(c.capturing);
    }
  }
  return (
    <section
      ref={box}
      className={`${c.insights} insights-print`}
      aria-labelledby="insights-title"
    >
      <div className={c.printHead}>
        <strong>أكلات جدتنا — تقرير الإحصاءات</strong>
        <span>
          آخر {period} · صدر في{" "}
          {d ? new Date(d.generatedAt).toLocaleString("ar-SA-u-nu-latn") : ""}
        </span>
      </div>
      <header className={c.head}>
        <h2 id="insights-title">الإحصاءات</h2>
        <div className={c.ranges} role="group" aria-label="مدة الإحصاءات">
          {RANGES.map(([n, label]) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === n}
              className={days === n ? c.rangeOn : c.range}
              onClick={() => setDays(n)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={c.export}
          onClick={exportPdf}
          disabled={!d}
        >
          تصدير PDF
        </button>
        <div className={c.share} data-no-capture="1">
          <button
            type="button"
            className={c.whatsapp}
            onClick={sendWhatsApp}
            disabled={!d}
          >
            ملخص واتساب
          </button>
          <button
            type="button"
            className={c.whatsapp}
            onClick={sharePdf}
            disabled={!d || sharing === "جارٍ تجهيز الملف…"}
          >
            مشاركة PDF
          </button>
        </div>
      </header>
      {sharing && (
        <p role="status" className={c.muted} data-no-capture="1">
          {sharing}
        </p>
      )}
      {error && (
        <p role="alert" className={c.error}>
          {error}
        </p>
      )}
      {!d && !error && <p role="status">جارٍ حساب الإحصاءات…</p>}
      {d && cur && prev && (
        <>
          <h3 className={c.section}>المؤشرات الرئيسية · آخر {period}</h3>
          <div className={c.tiles}>
            <Tile label="الطلبات" value={num(cur.orders)}>
              <Delta now={cur.orders} before={prev.orders} />
            </Tile>
            <Tile label="طلبات مكتملة" value={num(cur.completed)}>
              <Delta now={cur.completed} before={prev.completed} />
            </Tile>
            <Tile
              label="نسبة الإتمام"
              value={rate(cur) === null ? "—" : `${num(rate(cur))}٪`}
              hint="المكتمل من كل الطلبات"
            />
            <Tile
              label="القيمة التقديرية"
              value={sar(cur.value)}
              hint="السعر × الكمية × الأيام، بلا المرفوض والملغى"
            >
              <Delta now={cur.value} before={prev.value} />
            </Tile>
            <Tile label="متوسط قيمة الطلب" value={sar(d.averageValue)} />
            <Tile label="عملاء طلبوا" value={num(cur.customers)}>
              <Delta now={cur.customers} before={prev.customers} />
            </Tile>
            <Tile
              label="العملاء العائدون"
              value={d.repeatRate === null ? "—" : `${num(d.repeatRate)}٪`}
              hint="من طلب أكثر من مرة"
            />
            <Tile
              label="متوسط رد الأسرة"
              value={
                cur.responseHours === null ? "—" : `${num(cur.responseHours)} س`
              }
              hint="من الطلب حتى فتحه"
            >
              <Delta
                now={cur.responseHours}
                before={prev.responseHours}
                lowerIsBetter
              />
            </Tile>
            <Tile label="أعضاء جدد" value={num(cur.members)}>
              <Delta now={cur.members} before={prev.members} />
            </Tile>
            <Tile label="أسر جديدة" value={num(cur.families)}>
              <Delta now={cur.families} before={prev.families} />
            </Tile>
            <Tile label="دعوات ناجحة" value={num(cur.referrals)}>
              <Delta now={cur.referrals} before={prev.referrals} />
            </Tile>
            <Tile label="محادثات جديدة" value={num(cur.conversations)}>
              <Delta now={cur.conversations} before={prev.conversations} />
            </Tile>
            <Tile label="رسائل" value={num(cur.messages)}>
              <Delta now={cur.messages} before={prev.messages} />
            </Tile>
            <Tile
              label="تقييمات"
              value={num(cur.ratings)}
              hint={
                cur.stars === null
                  ? undefined
                  : `المتوسط ${num(cur.stars)} من 5`
              }
            >
              <Delta now={cur.ratings} before={prev.ratings} />
            </Tile>
            <Tile label="طلبات اشتراك" value={num(cur.subscriptions)}>
              <Delta now={cur.subscriptions} before={prev.subscriptions} />
            </Tile>
            <Tile
              label="طلبات العملاء"
              value={num(cur.requests)}
              hint="ما ينشره العملاء ليطلبوه"
            >
              <Delta now={cur.requests} before={prev.requests} />
            </Tile>
          </div>

          <h3 className={c.section}>الإجمالي الآن</h3>
          <div className={c.tiles}>
            <Tile label="العملاء" value={num(Number(d.totals.customers))} />
            <Tile label="أسر معتمدة" value={num(Number(d.totals.families))} />
            <Tile label="منتجات ظاهرة" value={num(Number(d.totals.products))} />
            <Tile
              label="مندوبون نشطون"
              value={num(Number(d.totals.couriers))}
            />
          </div>

          <h3 className={c.section}>التوقع للأسابيع الأربعة القادمة</h3>
          <p className={c.muted}>
            تقدير بخط اتجاه آخر {num(d.forecast.basis)} أسابيع مكتملة؛ يتحسن
            كلما زادت البيانات، ولا يُعد وعدًا.
          </p>
          <div className={c.tiles}>
            <Tile label="طلبات متوقعة" value={num(d.forecast.orders)} />
            <Tile label="أعضاء جدد متوقعون" value={num(d.forecast.members)} />
            <Tile label="قيمة تقديرية متوقعة" value={sar(d.forecast.value)} />
          </div>
          <div className={c.grid}>
            <Weekly
              title="الطلبات أسبوعيًا (12 أسبوعًا)"
              weeks={d.weekly}
              pick={(w) => w.orders}
            />
            <Weekly
              title="الأعضاء الجدد أسبوعيًا (12 أسبوعًا)"
              weeks={d.weekly}
              pick={(w) => w.members}
            />
          </div>

          <h3 className={c.section}>توزيع الطلبات · آخر {period}</h3>
          <div className={c.grid}>
            <Bars title="حسب المنطقة" rows={d.breakdowns.regions as Row[]} />
            <Bars title="حسب القسم" rows={d.breakdowns.categories as Row[]} />
            <Bars
              title="حسب الوجبة"
              rows={d.breakdowns.meals as Row[]}
              label={(r) => MEALS[String(r.label)] ?? String(r.label)}
            />
            <Bars
              title="حسب يوم الأسبوع"
              rows={d.breakdowns.weekdays as Row[]}
              label={(r) => DAYS[Number(r.label)] ?? String(r.label)}
            />
            <Bars
              title="حسب وقت الطلب (الرياض)"
              rows={d.breakdowns.hours as Row[]}
              label={(r) => hourLabel(Number(r.label))}
            />
          </div>

          <h3 className={c.section}>الأفضل</h3>
          <div className={c.grid}>
            <Bars title="الأسر الأكثر طلبًا" rows={d.top.families as Row[]} />
            <Bars
              title="المنتجات الأكثر طلبًا"
              rows={d.top.products as Row[]}
            />
            <Bars
              title="المنتجات الأكثر مشاهدة (كل الوقت)"
              rows={d.top.viewed as Row[]}
            />
            <Bars
              title="الأسر الأعلى تقييمًا (3 مقيّمين فأكثر)"
              rows={d.top.rated as Row[]}
              empty="لا توجد أسرة قيّمها 3 أشخاص بعد"
            />
          </div>

          <h3 className={c.section}>فرص التسويق</h3>
          <div className={c.grid}>
            <Bars
              title="ما يطلبه العملاء (حسب القسم)"
              rows={d.demand.categories as Row[]}
            />
            <Bars
              title="ما يطلبه العملاء (حسب المدينة)"
              rows={d.demand.cities as Row[]}
            />
            <Bars
              title="مناطق فيها طلبات ولا أسرة معتمدة"
              rows={d.demand.gaps as Row[]}
              empty="لا توجد منطقة بطلبات بلا أسرة"
            />
          </div>
          <div className={c.card}>
            <p className={c.cardTitle}>توصيات من الأرقام</p>
            {tips(d).length ? (
              <ul className={c.tips}>
                {tips(d).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className={c.empty}>تظهر التوصيات مع تراكم الطلبات.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
