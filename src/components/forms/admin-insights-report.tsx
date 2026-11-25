"use client";
import type { AdminInsights as Data } from "@/server/insights";
import type { SiteTextKey } from "@/lib/site-texts";
import r from "./admin-insights-report.module.css";

/**
 * تقرير الإحصاءات لملف واتساب (طلب المالك 2026-11-25: «ملف الواتس اب غير مرتب»):
 * تخطيط خاص بعرض صفحة A4 ثابت (لا يتبع شاشة الجوال)، كل كتلة [data-report-block] تُصوَّر
 * وحدها وتوضع في الصفحات دون أن تنقسم. كل النصوص من «نصوص الموقع».
 */
type Tx = (key: SiteTextKey, vars?: Record<string, string | number>) => string;
type Row = { label: string | number; value: number; amount?: number };

const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  maximumFractionDigits: 1,
});
const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : nf.format(v);

function change(now: number | null, before: number | null, lower?: boolean) {
  if (now === null || before === null)
    return { text: "—", tone: "", pct: null as number | null };
  if (!before)
    return { text: now ? "+" : "—", tone: now ? r.up : "", pct: null };
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return { text: "0٪", tone: "", pct: 0 };
  const good = lower ? pct < 0 : pct > 0;
  return {
    text: `${pct > 0 ? "▲" : "▼"} ${nf.format(Math.abs(pct))}٪`,
    tone: good ? r.up : r.down,
    pct,
  };
}

function Table({
  title,
  rows,
  tx,
  label = (x) => String(x.label),
  empty,
  amount,
}: {
  title: string;
  rows: Row[];
  tx: Tx;
  label?: (x: Row) => string;
  empty?: string;
  amount?: (v: number) => string;
}) {
  const total = rows.reduce((a, x) => a + x.value, 0);
  return (
    <div className={r.tableCard}>
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className={r.empty}>{empty ?? tx("ins.empty")}</p>
      ) : (
        <table className={r.table}>
          <thead>
            <tr>
              <th className={r.rank}>#</th>
              <th />
              <th className={r.numCol}>{tx("ins.rColCount")}</th>
              <th className={r.numCol}>{tx("ins.rColShare")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={String(x.label)}>
                <td className={r.rank}>{i + 1}</td>
                <td>
                  {label(x)}
                  {x.amount && amount ? (
                    <small className={r.amount}> · {amount(x.amount)}</small>
                  ) : null}
                </td>
                <td className={r.numCol}>{num(x.value)}</td>
                <td className={r.numCol}>
                  <span className={r.share}>
                    <span
                      className={r.shareBar}
                      style={{
                        width: `${total ? (x.value / total) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  {total
                    ? `${nf.format(Math.round((x.value / total) * 100))}٪`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function InsightsReport({
  d,
  tx,
  period,
  sar,
  hourLabel,
  meal,
  day,
  tips,
  rate,
}: {
  d: Data;
  tx: Tx;
  period: string;
  sar: (v: number | null | undefined) => string;
  hourLabel: (h: number) => string;
  meal: (k: string) => string;
  day: (n: number) => string;
  tips: string[];
  rate: (x: Data["current"]) => number | null;
}) {
  const cur = d.current;
  const prev = d.previous;
  const hours = (v: number | null) =>
    v === null ? "—" : tx("ins.responseValue", { n: num(v) });
  const pct = (v: number | null) => (v === null ? "—" : `${num(v)}٪`);
  const metrics: [
    SiteTextKey,
    string,
    string,
    number | null,
    number | null,
    boolean?,
  ][] = [
    ["ins.orders", num(cur.orders), num(prev.orders), cur.orders, prev.orders],
    [
      "ins.completed",
      num(cur.completed),
      num(prev.completed),
      cur.completed,
      prev.completed,
    ],
    ["ins.completion", pct(rate(cur)), pct(rate(prev)), rate(cur), rate(prev)],
    ["ins.value", sar(cur.value), sar(prev.value), cur.value, prev.value],
    [
      "ins.customers",
      num(cur.customers),
      num(prev.customers),
      cur.customers,
      prev.customers,
    ],
    [
      "ins.response",
      hours(cur.responseHours),
      hours(prev.responseHours),
      cur.responseHours,
      prev.responseHours,
      true,
    ],
    [
      "ins.members",
      num(cur.members),
      num(prev.members),
      cur.members,
      prev.members,
    ],
    [
      "ins.families",
      num(cur.families),
      num(prev.families),
      cur.families,
      prev.families,
    ],
    [
      "ins.referrals",
      num(cur.referrals),
      num(prev.referrals),
      cur.referrals,
      prev.referrals,
    ],
    [
      "ins.conversations",
      num(cur.conversations),
      num(prev.conversations),
      cur.conversations,
      prev.conversations,
    ],
    [
      "ins.messages",
      num(cur.messages),
      num(prev.messages),
      cur.messages,
      prev.messages,
    ],
    [
      "ins.ratings",
      num(cur.ratings),
      num(prev.ratings),
      cur.ratings,
      prev.ratings,
    ],
    [
      "ins.subscriptions",
      num(cur.subscriptions),
      num(prev.subscriptions),
      cur.subscriptions,
      prev.subscriptions,
    ],
    [
      "ins.requests",
      num(cur.requests),
      num(prev.requests),
      cur.requests,
      prev.requests,
    ],
  ];
  const highlights: [SiteTextKey, string, number | null, number | null][] = [
    ["ins.orders", num(cur.orders), cur.orders, prev.orders],
    ["ins.value", sar(cur.value), cur.value, prev.value],
    ["ins.customers", num(cur.customers), cur.customers, prev.customers],
    ["ins.members", num(cur.members), cur.members, prev.members],
  ];
  const max = Math.max(1, ...d.weekly.map((w) => w.orders));
  return (
    <div className={r.report} dir="rtl">
      <header className={r.head} data-report-block>
        {/* biome-ignore lint/performance/noImgElement: يُصوَّر في ملف PDF */}
        <img src="/brand/jdatna-logo-v2.jpeg" alt="" className={r.logo} />
        <div className={r.titles}>
          <span className={r.brand}>{tx("ins.rBrand")}</span>
          <h2>{tx("ins.rTitle")}</h2>
          <span className={r.meta}>
            {tx("ins.printMeta", {
              period,
              date: new Date(d.generatedAt).toLocaleString("ar-SA-u-nu-latn", {
                dateStyle: "long",
                timeStyle: "short",
              }),
            })}
          </span>
        </div>
      </header>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.rHighlights")}</h3>
        <div className={r.heroes}>
          {highlights.map(([k, v, now, before]) => {
            const c = change(now, before);
            return (
              <div key={k} className={r.hero}>
                <span>{tx(k)}</span>
                <strong>{v}</strong>
                <small className={c.tone}>
                  {c.pct === null
                    ? ""
                    : c.pct === 0
                      ? tx("ins.deltaFlat")
                      : `${c.pct > 0 ? "▲" : "▼"} ${tx("ins.deltaPct", {
                          pct: nf.format(Math.abs(c.pct)),
                        })}`}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.rDetails")}</h3>
        <table className={r.table}>
          <thead>
            <tr>
              <th>{tx("ins.rColMetric")}</th>
              <th className={r.numCol}>{tx("ins.rColNow")}</th>
              <th className={r.numCol}>{tx("ins.rColPrev")}</th>
              <th className={r.numCol}>{tx("ins.rColChange")}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([k, nowText, prevText, now, before, lower]) => {
              const c = change(now, before, lower);
              return (
                <tr key={k}>
                  <td>{tx(k)}</td>
                  <td className={`${r.numCol} ${r.strong}`}>{nowText}</td>
                  <td className={r.numCol}>{prevText}</td>
                  <td className={`${r.numCol} ${c.tone}`}>{c.text}</td>
                </tr>
              );
            })}
            <tr>
              <td>{tx("ins.average")}</td>
              <td className={`${r.numCol} ${r.strong}`}>
                {sar(d.averageValue)}
              </td>
              <td className={r.numCol}>—</td>
              <td className={r.numCol}>—</td>
            </tr>
            <tr>
              <td>{tx("ins.repeat")}</td>
              <td className={`${r.numCol} ${r.strong}`}>{pct(d.repeatRate)}</td>
              <td className={r.numCol}>—</td>
              <td className={r.numCol}>—</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.secTotals")}</h3>
        <div className={r.strip}>
          {(
            [
              ["ins.totCustomers", d.totals.customers],
              ["ins.totFamilies", d.totals.families],
              ["ins.totProducts", d.totals.products],
              ["ins.totCouriers", d.totals.couriers],
            ] as [SiteTextKey, unknown][]
          ).map(([k, v]) => (
            <div key={k}>
              <strong>{num(Number(v))}</strong>
              <span>{tx(k)}</span>
            </div>
          ))}
        </div>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.secForecast")}</h3>
        <div className={r.strip}>
          <div>
            <strong>{num(d.forecast.orders)}</strong>
            <span>{tx("ins.fOrders")}</span>
          </div>
          <div>
            <strong>{num(d.forecast.members)}</strong>
            <span>{tx("ins.fMembers")}</span>
          </div>
          <div>
            <strong>{sar(d.forecast.value)}</strong>
            <span>{tx("ins.fValue")}</span>
          </div>
        </div>
        <p className={r.note}>
          {tx("ins.forecastNote", { n: num(d.forecast.basis) })}
        </p>
        <div className={r.chart}>
          <h4>{tx("ins.weeklyOrders")}</h4>
          <div className={r.columns}>
            {d.weekly.map((w) => (
              <div key={w.week} className={r.column}>
                <small>{w.orders || ""}</small>
                <span
                  style={{ height: `${Math.max(2, (w.orders / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className={r.axis}>
            <span>{d.weekly[0]?.week}</span>
            <span>{d.weekly.at(-1)?.week}</span>
          </div>
        </div>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.secBreakdown", { period })}</h3>
        <div className={r.pair}>
          <Table
            tx={tx}
            title={tx("ins.byRegion")}
            rows={d.breakdowns.regions as Row[]}
          />
          <Table
            tx={tx}
            title={tx("ins.byCategory")}
            rows={d.breakdowns.categories as Row[]}
          />
        </div>
      </section>
      <section data-report-block>
        <div className={r.pair}>
          <Table
            tx={tx}
            title={tx("ins.byWeekday")}
            rows={d.breakdowns.weekdays as Row[]}
            label={(x) => day(Number(x.label))}
          />
          <div className={r.stack}>
            <Table
              tx={tx}
              title={tx("ins.byHour")}
              rows={d.breakdowns.hours as Row[]}
              label={(x) => hourLabel(Number(x.label))}
            />
            <Table
              tx={tx}
              title={tx("ins.byMeal")}
              rows={d.breakdowns.meals as Row[]}
              label={(x) => meal(String(x.label))}
            />
          </div>
        </div>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.secTop")}</h3>
        <div className={r.pair}>
          <Table
            tx={tx}
            title={tx("ins.topFamilies")}
            rows={d.top.families as Row[]}
            amount={sar}
          />
          <Table
            tx={tx}
            title={tx("ins.topProducts")}
            rows={d.top.products as Row[]}
          />
        </div>
      </section>
      <section data-report-block>
        <div className={r.pair}>
          <Table
            tx={tx}
            title={tx("ins.topViewed")}
            rows={d.top.viewed as Row[]}
          />
          <Table
            tx={tx}
            title={tx("ins.topRated")}
            rows={d.top.rated as Row[]}
            empty={tx("ins.topRatedEmpty")}
          />
        </div>
      </section>

      <section data-report-block>
        <h3 className={r.section}>{tx("ins.secMarketing")}</h3>
        <div className={r.pair}>
          <Table
            tx={tx}
            title={tx("ins.demandCategory")}
            rows={d.demand.categories as Row[]}
          />
          <Table
            tx={tx}
            title={tx("ins.demandCity")}
            rows={d.demand.cities as Row[]}
          />
        </div>
      </section>
      <section data-report-block>
        <div className={r.single}>
          <Table
            tx={tx}
            title={tx("ins.gaps")}
            rows={d.demand.gaps as Row[]}
            empty={tx("ins.gapsEmpty")}
          />
        </div>
      </section>
      <section data-report-block>
        <div className={r.tips}>
          <h4>{tx("ins.tipsTitle")}</h4>
          {tips.length ? (
            <ol>
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          ) : (
            <p className={r.empty}>{tx("ins.tipsEmpty")}</p>
          )}
        </div>
        <p className={r.footer}>{tx("ins.rFooter")}</p>
      </section>
    </div>
  );
}
