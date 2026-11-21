"use client";
import { useEffect, useState } from "react";
import { api, s } from "./shared";

type Insights = {
  regionName: string | null;
  popular: { category: string; orders: number }[];
  opportunities: { category: string; orders: number; families: number }[];
  alsoBought: { category: string; customers: number }[];
};

/**
 * «طلب منطقتك» في لوحة الأسرة: ما يطلبه الناس في منطقتها، وفرص لأقسام عليها طلب وقليل من
 * يقدّمها، وما يطلبه عملاؤها من أسر أخرى. أرقام مجمّعة فقط (لا يظهر أقل من 3).
 */
export function FamilyInsightsCard() {
  const [data, setData] = useState<Insights | null>(null);
  useEffect(() => {
    let active = true;
    api<{ insights: Insights | null }>("/api/producer/insights")
      .then((d) => active && setData(d.insights))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!data) return null;
  const empty =
    !data.popular.length &&
    !data.opportunities.length &&
    !data.alsoBought.length;
  return (
    <section className={s.card} aria-labelledby="family-insights-title">
      <h2 id="family-insights-title">
        طلب منطقتك{data.regionName ? ` (${data.regionName})` : ""}
      </h2>
      {empty ? (
        <p className={s.muted}>
          لا توجد طلبات كافية في منطقتك آخر 30 يومًا لعرض اتجاهات. تظهر هنا كلما
          زادت الطلبات.
        </p>
      ) : (
        <>
          {data.popular.length > 0 && (
            <>
              <h3>الأكثر طلبًا آخر 30 يومًا</h3>
              <ul>
                {data.popular.map((p) => (
                  <li key={p.category}>
                    <strong>{p.category}</strong>: {p.orders} طلب
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.opportunities.length > 0 && (
            <>
              <h3>فرص لأسرتك</h3>
              <p className={s.muted}>
                أقسام عليها طلب في منطقتك وقليل من الأسر تقدّمها، ولا تقدّمها
                أسرتك بعد.
              </p>
              <ul>
                {data.opportunities.map((o) => (
                  <li key={o.category}>
                    <strong>{o.category}</strong>: {o.orders} طلب،{" "}
                    {o.families
                      ? `تقدّمه ${o.families} ${o.families === 1 ? "أسرة" : "أسر"}`
                      : "لا تقدّمه أسرة في منطقتك"}
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.alsoBought.length > 0 && (
            <>
              <h3>عملاؤك يطلبون أيضًا</h3>
              <ul>
                {data.alsoBought.map((a) => (
                  <li key={a.category}>
                    <strong>{a.category}</strong>: {a.customers} من عملائك
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
