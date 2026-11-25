"use client";
import { useEffect, useRef, useState } from "react";
import type { AdminInsights as Data } from "@/server/insights";
import { api, useSession, useSiteTexts } from "./session";
import type { SiteTextKey } from "@/lib/site-texts";
import c from "./admin-insights.module.css";

/**
 * إحصاءات الإدارة الرئيسية (طلب المالك 2026-11-25): مربعات مفصّلة مع المقارنة بالفترة السابقة،
 * وتوزيع الطلبات، والأفضل، وفرص التسويق، وتوقع الأسابيع الأربعة القادمة. «تصدير PDF» يطبع
 * هذا القسم وحده من المتصفح (حفظ بصيغة PDF)، فتبقى العربية والاتجاه سليمين.
 */
const RANGES: [number, SiteTextKey][] = [
  [7, "ins.range7"],
  [30, "ins.range30"],
  [90, "ins.range90"],
  [365, "ins.range365"],
];
const MEALS: Record<string, SiteTextKey> = {
  breakfast: "ins.mealBreakfast",
  lunch: "ins.mealLunch",
  dinner: "ins.mealDinner",
  occasion: "ins.mealOccasion",
};
const DAYS: SiteTextKey[] = [
  "ins.day0",
  "ins.day1",
  "ins.day2",
  "ins.day3",
  "ins.day4",
  "ins.day5",
  "ins.day6",
];
type Tx = ReturnType<typeof useSiteTexts>["tx"];
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  maximumFractionDigits: 1,
});
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(v);
const sar = (tx: Tx, v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : tx("ins.currency", { n: nf.format(Math.round(v)) });
const hourLabel = (tx: Tx, h: number) =>
  tx("ins.hourRange", {
    from: `${String(h).padStart(2, "0")}:00`,
    to: `${String(h + 3).padStart(2, "0")}:00`,
  });

type Row = { label: string | number; value: number; amount?: number };

/** الفرق عن الفترة السابقة: سهم ونص، لا لون وحده. */
function Delta({
  tx,
  now,
  before,
  lowerIsBetter,
}: {
  tx: Tx;
  now: number | null;
  before: number | null;
  lowerIsBetter?: boolean;
}) {
  if (now === null || before === null) return null;
  if (!before)
    return now ? (
      <small className={c.deltaNew}>{tx("ins.deltaNew")}</small>
    ) : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return <small className={c.deltaFlat}>{tx("ins.deltaFlat")}</small>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <small className={good ? c.deltaUp : c.deltaDown}>
      {pct > 0 ? "▲" : "▼"}{" "}
      {tx("ins.deltaPct", { pct: nf.format(Math.abs(pct)) })}
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
  tx,
  title,
  rows,
  label = (r) => String(r.label),
  empty,
}: {
  tx: Tx;
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
        <p className={c.empty}>{empty ?? tx("ins.empty")}</p>
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
                {r.amount ? <small> · {sar(tx, r.amount)}</small> : null}
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
  tx,
  title,
  weeks,
  pick,
}: {
  tx: Tx;
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
            · {tx("ins.weekNow", { n: num(pick(last)) })}
          </small>
        )}
      </figcaption>
      <div className={c.columns} aria-hidden="true">
        {weeks.map((w, i) => (
          <span
            key={w.week}
            className={`${c.column} ${i === weeks.length - 1 ? c.columnNow : ""}`}
            title={`${tx("ins.week", { week: w.week })}: ${num(pick(w))}`}
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
              <th scope="row">{tx("ins.week", { week: w.week })}</th>
              <td>{pick(w)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** توصيات تسويقية مستخرجة من الأرقام نفسها، بلا افتراضات. */
function tips(tx: Tx, d: Data) {
  const out: string[] = [];
  const topDay = [...d.breakdowns.weekdays].sort(
    (a, b) => b.value - a.value,
  )[0];
  if (topDay)
    out.push(tx("ins.tipDay", { day: tx(DAYS[Number(topDay.label)]) }));
  const topHour = [...d.breakdowns.hours].sort((a, b) => b.value - a.value)[0];
  if (topHour)
    out.push(
      tx("ins.tipHour", { hours: hourLabel(tx, Number(topHour.label)) }),
    );
  const topCat = d.breakdowns.categories[0];
  if (topCat)
    out.push(tx("ins.tipCategory", { category: String(topCat.label) }));
  const wanted = d.demand.categories[0];
  if (wanted)
    out.push(
      tx("ins.tipWanted", {
        category: String(wanted.label),
        n: num(wanted.value),
      }),
    );
  for (const g of d.demand.gaps.slice(0, 2))
    out.push(tx("ins.tipGap", { region: String(g.label) }));
  if (d.repeatRate !== null && d.repeatRate < 30)
    out.push(tx("ins.tipRepeat", { n: num(d.repeatRate) }));
  if (d.current.responseHours !== null && Number(d.current.responseHours) > 3)
    out.push(tx("ins.tipResponse", { n: num(d.current.responseHours) }));
  return out.filter(Boolean);
}

/** ملخص نصي لواتساب: أهم الأرقام والتوقع والتوصيات. */
function summaryText(tx: Tx, d: Data, period: string) {
  const cur = d.current;
  const lines = [
    `*${tx("ins.waTitle", { period })}*`,
    "",
    tx("ins.waOrders", {
      orders: num(cur.orders),
      completed: num(cur.completed),
    }),
    tx("ins.waValue", {
      value: sar(tx, cur.value),
      average: sar(tx, d.averageValue),
    }),
    tx("ins.waCustomers", {
      customers: num(cur.customers),
      repeat: d.repeatRate === null ? "—" : `${num(d.repeatRate)}٪`,
    }),
    tx("ins.waGrowth", {
      members: num(cur.members),
      families: num(cur.families),
    }),
    tx("ins.waResponse", {
      hours:
        cur.responseHours === null
          ? "—"
          : tx("ins.responseValue", { n: num(cur.responseHours) }),
    }),
    "",
    `*${tx("ins.waForecastTitle")}*`,
    tx("ins.waForecast", {
      orders: num(d.forecast.orders),
      members: num(d.forecast.members),
      value: sar(tx, d.forecast.value),
    }),
  ];
  const t = tips(tx, d);
  if (t.length)
    lines.push("", `*${tx("ins.waTips")}*`, ...t.map((x) => `• ${x}`));
  return lines.join("\n");
}

export function AdminInsights() {
  const box = useRef<HTMLElement>(null);
  const [sharing, setSharing] = useState("");
  const { user } = useSession();
  const { tx, txb } = useSiteTexts();
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
  const periodKey = RANGES.find(([n]) => n === days)?.[1];
  const period = periodKey ? tx(periodKey) : "";
  function exportPdf() {
    document.body.classList.add("print-insights");
    window.print();
  }
  function sendWhatsApp() {
    if (!d) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(summaryText(tx, d, period))}`,
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
    setSharing(tx("ins.preparing"));
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
          .share({ files: [file], title: tx("ins.shareTitle") })
          .catch(() => {});
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setSharing(tx("ins.saved"));
      }
    } catch {
      setSharing(tx("ins.shareFailed"));
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
        <strong>{tx("ins.printTitle")}</strong>
        <span>
          {tx("ins.printMeta", {
            period,
            date: d
              ? new Date(d.generatedAt).toLocaleString("ar-SA-u-nu-latn")
              : "",
          })}
        </span>
      </div>
      <header className={c.head}>
        <h2 id="insights-title">{txb("ins.title")}</h2>
        <div className={c.ranges} role="group" aria-label={txb("ins.title")}>
          {RANGES.map(([n, label]) => (
            <button
              key={n}
              type="button"
              aria-pressed={days === n}
              className={days === n ? c.rangeOn : c.range}
              onClick={() => setDays(n)}
            >
              {txb(label)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={c.export}
          onClick={exportPdf}
          disabled={!d}
        >
          {txb("ins.export")}
        </button>
        <div className={c.share} data-no-capture="1">
          <button
            type="button"
            className={c.whatsapp}
            onClick={sendWhatsApp}
            disabled={!d}
          >
            {txb("ins.whatsapp")}
          </button>
          <button
            type="button"
            className={c.whatsapp}
            onClick={sharePdf}
            disabled={!d || sharing === tx("ins.preparing")}
          >
            {txb("ins.sharePdf")}
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
      {!d && !error && <p role="status">{tx("ins.loading")}</p>}
      {d && cur && prev && (
        <>
          <h3 className={c.section}>{tx("ins.secMain", { period })}</h3>
          <div className={c.tiles}>
            <Tile label={tx("ins.orders")} value={num(cur.orders)}>
              <Delta tx={tx} now={cur.orders} before={prev.orders} />
            </Tile>
            <Tile label={tx("ins.completed")} value={num(cur.completed)}>
              <Delta tx={tx} now={cur.completed} before={prev.completed} />
            </Tile>
            <Tile
              label={tx("ins.completion")}
              value={rate(cur) === null ? "—" : `${num(rate(cur))}٪`}
              hint={tx("ins.completionHint")}
            />
            <Tile
              label={tx("ins.value")}
              value={sar(tx, cur.value)}
              hint={tx("ins.valueHint")}
            >
              <Delta tx={tx} now={cur.value} before={prev.value} />
            </Tile>
            <Tile label={tx("ins.average")} value={sar(tx, d.averageValue)} />
            <Tile label={tx("ins.customers")} value={num(cur.customers)}>
              <Delta tx={tx} now={cur.customers} before={prev.customers} />
            </Tile>
            <Tile
              label={tx("ins.repeat")}
              value={d.repeatRate === null ? "—" : `${num(d.repeatRate)}٪`}
              hint={tx("ins.repeatHint")}
            />
            <Tile
              label={tx("ins.response")}
              value={
                cur.responseHours === null
                  ? "—"
                  : tx("ins.responseValue", { n: num(cur.responseHours) })
              }
              hint={tx("ins.responseHint")}
            >
              <Delta
                tx={tx}
                now={cur.responseHours}
                before={prev.responseHours}
                lowerIsBetter
              />
            </Tile>
            <Tile label={tx("ins.members")} value={num(cur.members)}>
              <Delta tx={tx} now={cur.members} before={prev.members} />
            </Tile>
            <Tile label={tx("ins.families")} value={num(cur.families)}>
              <Delta tx={tx} now={cur.families} before={prev.families} />
            </Tile>
            <Tile label={tx("ins.referrals")} value={num(cur.referrals)}>
              <Delta tx={tx} now={cur.referrals} before={prev.referrals} />
            </Tile>
            <Tile
              label={tx("ins.conversations")}
              value={num(cur.conversations)}
            >
              <Delta
                tx={tx}
                now={cur.conversations}
                before={prev.conversations}
              />
            </Tile>
            <Tile label={tx("ins.messages")} value={num(cur.messages)}>
              <Delta tx={tx} now={cur.messages} before={prev.messages} />
            </Tile>
            <Tile
              label={tx("ins.ratings")}
              value={num(cur.ratings)}
              hint={
                cur.stars === null
                  ? undefined
                  : tx("ins.starsHint", { n: num(cur.stars) })
              }
            >
              <Delta tx={tx} now={cur.ratings} before={prev.ratings} />
            </Tile>
            <Tile
              label={tx("ins.subscriptions")}
              value={num(cur.subscriptions)}
            >
              <Delta
                tx={tx}
                now={cur.subscriptions}
                before={prev.subscriptions}
              />
            </Tile>
            <Tile
              label={tx("ins.requests")}
              value={num(cur.requests)}
              hint={tx("ins.requestsHint")}
            >
              <Delta tx={tx} now={cur.requests} before={prev.requests} />
            </Tile>
          </div>

          <h3 className={c.section}>{tx("ins.secTotals")}</h3>
          <div className={c.tiles}>
            <Tile
              label={tx("ins.totCustomers")}
              value={num(Number(d.totals.customers))}
            />
            <Tile
              label={tx("ins.totFamilies")}
              value={num(Number(d.totals.families))}
            />
            <Tile
              label={tx("ins.totProducts")}
              value={num(Number(d.totals.products))}
            />
            <Tile
              label={tx("ins.totCouriers")}
              value={num(Number(d.totals.couriers))}
            />
          </div>

          <h3 className={c.section}>{tx("ins.secForecast")}</h3>
          <p className={c.muted}>
            {tx("ins.forecastNote", { n: num(d.forecast.basis) })}
          </p>
          <div className={c.tiles}>
            <Tile label={tx("ins.fOrders")} value={num(d.forecast.orders)} />
            <Tile label={tx("ins.fMembers")} value={num(d.forecast.members)} />
            <Tile label={tx("ins.fValue")} value={sar(tx, d.forecast.value)} />
          </div>
          <div className={c.grid}>
            <Weekly
              tx={tx}
              title={tx("ins.weeklyOrders")}
              weeks={d.weekly}
              pick={(w) => w.orders}
            />
            <Weekly
              tx={tx}
              title={tx("ins.weeklyMembers")}
              weeks={d.weekly}
              pick={(w) => w.members}
            />
          </div>

          <h3 className={c.section}>{tx("ins.secBreakdown", { period })}</h3>
          <div className={c.grid}>
            <Bars
              tx={tx}
              title={tx("ins.byRegion")}
              rows={d.breakdowns.regions as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.byCategory")}
              rows={d.breakdowns.categories as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.byMeal")}
              rows={d.breakdowns.meals as Row[]}
              label={(r) => {
                const k = MEALS[String(r.label)];
                return k ? tx(k) : String(r.label);
              }}
            />
            <Bars
              tx={tx}
              title={tx("ins.byWeekday")}
              rows={d.breakdowns.weekdays as Row[]}
              label={(r) => {
                const k = DAYS[Number(r.label)];
                return k ? tx(k) : String(r.label);
              }}
            />
            <Bars
              tx={tx}
              title={tx("ins.byHour")}
              rows={d.breakdowns.hours as Row[]}
              label={(r) => hourLabel(tx, Number(r.label))}
            />
          </div>

          <h3 className={c.section}>{tx("ins.secTop")}</h3>
          <div className={c.grid}>
            <Bars
              tx={tx}
              title={tx("ins.topFamilies")}
              rows={d.top.families as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.topProducts")}
              rows={d.top.products as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.topViewed")}
              rows={d.top.viewed as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.topRated")}
              rows={d.top.rated as Row[]}
              empty={tx("ins.topRatedEmpty")}
            />
          </div>

          <h3 className={c.section}>{tx("ins.secMarketing")}</h3>
          <div className={c.grid}>
            <Bars
              tx={tx}
              title={tx("ins.demandCategory")}
              rows={d.demand.categories as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.demandCity")}
              rows={d.demand.cities as Row[]}
            />
            <Bars
              tx={tx}
              title={tx("ins.gaps")}
              rows={d.demand.gaps as Row[]}
              empty={tx("ins.gapsEmpty")}
            />
          </div>
          <div className={c.card}>
            <p className={c.cardTitle}>{tx("ins.tipsTitle")}</p>
            {tips(tx, d).length ? (
              <ul className={c.tips}>
                {tips(tx, d).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className={c.empty}>{tx("ins.tipsEmpty")}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
