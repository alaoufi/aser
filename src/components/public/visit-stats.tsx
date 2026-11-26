"use client";
import { T } from "@/components/site-texts";
import { createContext, useContext, useEffect, useState } from "react";

type Stats =
  | { visible: false }
  | {
      visible: true;
      adminOnly: boolean;
      today: number;
      total: number;
      online: number;
    };
const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    // الجسم يُقرأ دائمًا، حتى مع رد خطأ، وإلا بقي الطلب مفتوحًا في المتصفح.
  }).then(async (r) => {
    const data = await r.json().catch(() => null);
    return r.ok ? data : null;
  });
const num = (n: number) => n.toLocaleString("en-US");
/** زيارة واحدة لكل تحميل للصفحة، ولو بدأ المكوّن مرتين (وضع التطوير). التحديث يعيد تحميل الملف فيُحسب من جديد. */
let pageHitSent = false;

/**
 * الزوار أسفل كل صفحة: زوار اليوم، وإجمالي الزوار، والمتواجدون الآن. نبضة كل دقيقتين
 * والصفحة ظاهرة. يظهر للجميع إن فعّلته الإدارة، وإلا للإدارة فقط بعلامة توضح ذلك.
 */
export function VisitStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let active = true;
    // فتح الصفحة أو تحديثها زيارة (hit)، والنبضة الدورية تبقي الزائر «متواجدًا الآن» فقط.
    const beat = (hit = false) => {
      if (!hit && document.visibilityState !== "visible") return;
      post("/api/visits", hit ? { hit: true } : undefined)
        .then((d: Stats | null) => active && d && setStats(d))
        .catch(() => {});
    };
    if (pageHitSent) beat();
    else {
      pageHitSent = true;
      beat(true);
    }
    const onVisible = () => beat();
    const timer = setInterval(onVisible, 120_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!stats?.visible) return null;
  return (
    <section className="visit-stats" aria-label="إحصاءات الزوار">
      <span>
        <span aria-hidden="true">👥</span> زوار اليوم: <b>{num(stats.today)}</b>
      </span>
      <span>
        <span aria-hidden="true">📈</span> إجمالي الزوار:{" "}
        <b>{num(stats.total)}</b>
      </span>
      <span>
        <span aria-hidden="true" className="online-dot" /> المتواجدون الآن:{" "}
        <b>{num(stats.online)}</b>
      </span>
      {stats.adminOnly && (
        <small className="visit-admin-only">
          <T k="c.visits.t1" />
        </small>
      )}
    </section>
  );
}

/** مشاهدات صفحة منتج أو أسرة: تُسجَّل عند فتحها، ويظهر العدد بحسب إعداد الإدارة. */
export function ViewCount({
  kind,
  id,
}: {
  kind: "product" | "producer";
  id: string;
}) {
  const [stats, setStats] = useState<
    | { visible: false }
    | { visible: true; views: number; adminOnly: boolean }
    | null
  >(null);
  useEffect(() => {
    post("/api/views", { kind, id })
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, [kind, id]);
  if (!stats?.visible) return null;
  return (
    <p className="view-count">
      <span aria-hidden="true">👁</span> {num(stats.views)} مشاهدة
      {stats.adminOnly && (
        <small className="visit-admin-only">
          {" "}
          <T k="c.visits.t1" />
        </small>
      )}
    </p>
  );
}

type FamilyStats =
  | { visible: false }
  | {
      visible: true;
      views: number;
      adminOnly: boolean;
      productsViews: number;
      products: Record<string, number>;
    };
const FamilyViewsContext = createContext<FamilyStats | null>(null);

/**
 * صفحة الأسرة: تسجّل مشاهدة الصفحة مرة، وتشارك الأعداد مع الملخص وبطاقات المنتجات تحتها
 * (مشاهدات الصفحة، وإجمالي مشاهدات المنتجات، وعدد كل منتج). الظهور بحسب إعداد الإدارة.
 */
export function FamilyViews({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const [stats, setStats] = useState<FamilyStats | null>(null);
  useEffect(() => {
    post("/api/views", { kind: "producer", id })
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, [id]);
  return (
    <FamilyViewsContext.Provider value={stats}>
      {children}
    </FamilyViewsContext.Provider>
  );
}

export function FamilyViewsSummary() {
  const stats = useContext(FamilyViewsContext);
  if (!stats?.visible) return null;
  return (
    <p className="view-count">
      <span aria-hidden="true">👁</span> {num(stats.views)} مشاهدة للصفحة ·{" "}
      {num(stats.productsViews)} مشاهدة لمنتجاتها
      {stats.adminOnly && (
        <small className="visit-admin-only">
          {" "}
          <T k="c.visits.t1" />
        </small>
      )}
    </p>
  );
}

export function ProductViewBadge({ id }: { id: string }) {
  const stats = useContext(FamilyViewsContext);
  if (!stats?.visible) return null;
  return (
    <small className="view-count card-views">
      <span aria-hidden="true">👁</span> {num(stats.products[id] ?? 0)} مشاهدة
    </small>
  );
}
