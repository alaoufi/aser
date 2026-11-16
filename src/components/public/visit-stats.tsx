"use client";
import { useEffect, useState } from "react";

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
    // يُكمل الطلب حتى لو أُغلقت الصفحة أثناءه، فلا ينقطع في منتصفه.
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => (r.ok ? r.json() : null));
const num = (n: number) => n.toLocaleString("en-US");

/**
 * الزوار أسفل كل صفحة: زوار اليوم، وإجمالي الزوار، والمتواجدون الآن. نبضة كل دقيقتين
 * والصفحة ظاهرة. يظهر للجميع إن فعّلته الإدارة، وإلا للإدارة فقط بعلامة توضح ذلك.
 */
export function VisitStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let active = true;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      post("/api/visits")
        .then((d: Stats | null) => active && d && setStats(d))
        .catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 120_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
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
        <small className="visit-admin-only">(ظاهر للإدارة فقط)</small>
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
        <small className="visit-admin-only"> (ظاهر للإدارة فقط)</small>
      )}
    </p>
  );
}
