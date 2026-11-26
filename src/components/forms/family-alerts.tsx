"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AccountShell,
  Guard,
  Message,
  api,
  s,
  useSession,
  useSiteTexts,
} from "./shared";

type Follow = {
  producerSlug: string;
  producerName: string;
  notifyNew: boolean;
  notifySchedule: boolean;
  scope: "all" | "selected";
  productIds: string[];
  paused: boolean;
};
type Alert = {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  read: boolean;
};

/** «تنبيهاتي» (تنبيهات الأسرة 2026-11-26): الأسر التي يتابعها العضو، وإيقافها أو إلغاؤها، وآخر ما وصله. */
export function MyFamilyAlerts() {
  const session = useSession();
  const { tx } = useSiteTexts();
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    const [f, a] = await Promise.all([
      api<{ follows: Follow[] }>("/api/alerts/follows"),
      api<{ alerts: Alert[] }>("/api/alerts/inbox"),
    ]);
    setFollows(f.follows);
    setAlerts(a.alerts);
  };
  useEffect(() => {
    if (session.user) load().catch((e) => setError((e as Error).message));
  }, [session.user?.id]);
  async function change(producer: string, action: string) {
    setError("");
    try {
      await api("/api/alerts/follows", {
        method: "PATCH",
        body: JSON.stringify({ producer, action }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <AccountShell>
      <h1>{tx("alerts.pageTitle")}</h1>
      <Guard {...session} />
      {session.user && <p className={s.muted}>{tx("alerts.pageIntro")}</p>}
      <Message error={error} />
      {follows && follows.length === 0 && (
        <p className={s.notice}>{tx("alerts.empty")}</p>
      )}
      {follows?.map((f) => (
        <section
          key={f.producerSlug}
          className={s.card}
          aria-label={f.producerName}
        >
          <h2>
            <Link href={`/producers/${f.producerSlug}`}>{f.producerName}</Link>
          </h2>
          <p>
            {[
              f.notifyNew && tx("alerts.optNew"),
              f.notifySchedule && tx("alerts.optSchedule"),
            ]
              .filter(Boolean)
              .join(" · ")}
            {" — "}
            {f.scope === "all"
              ? tx("alerts.scopeAll")
              : `${tx("alerts.scopeSelected")} (${f.productIds.length})`}
            {f.paused && <strong> · {tx("alerts.paused")}</strong>}
          </p>
          <div className={s.actions}>
            <button
              type="button"
              onClick={() =>
                change(f.producerSlug, f.paused ? "resume" : "pause")
              }
            >
              {f.paused ? tx("alerts.resume") : tx("alerts.pause")}
            </button>
            <button
              type="button"
              onClick={() => change(f.producerSlug, "cancel")}
            >
              {tx("alerts.stop")}
            </button>
          </div>
        </section>
      ))}
      {session.user && (
        <section aria-labelledby="alerts-inbox">
          <h2 id="alerts-inbox">{tx("alerts.inbox")}</h2>
          {alerts.length === 0 ? (
            <p className={s.muted}>{tx("alerts.inboxEmpty")}</p>
          ) : (
            <ul className={`${s.list} member-alerts`}>
              {alerts.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <p className="pre-line">{a.body}</p>
                  <small>
                    <bdi>{new Date(a.createdAt).toLocaleString("ar-SA")}</bdi>
                    {" · "}
                    <a href={a.url}>فتح ←</a>
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AccountShell>
  );
}

type Schedule = {
  id: string;
  productId: string;
  productName: string;
  kind: "daily" | "weekly" | "date";
  weekdays: number[];
  startsOn: string;
  announced: boolean;
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

/** «جدول التوزيع» في لوحة الأسرة: جداول منتجاتها، وعدد متابعي تنبيهاتها فقط. */
export function FamilySchedules() {
  const session = useSession();
  const { tx } = useSiteTexts();
  const [data, setData] = useState<{
    schedules: Schedule[];
    products: { id: string; name: string }[];
    followers: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<"daily" | "weekly" | "date">("daily");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startsOn, setStartsOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const load = () =>
    api<NonNullable<typeof data>>("/api/producer/schedules").then(setData);
  useEffect(() => {
    if (session.user) load().catch((e) => setError((e as Error).message));
  }, [session.user?.id]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved("");
    try {
      await api("/api/producer/schedules", {
        method: "POST",
        body: JSON.stringify({
          productId: productId || data?.products[0]?.id,
          kind,
          weekdays: kind === "weekly" ? weekdays : [],
          startsOn,
        }),
      });
      setSaved("تم الحفظ");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await api("/api/producer/schedules", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const freq = (sc: Schedule) =>
    sc.kind === "daily"
      ? tx("schedule.daily")
      : sc.kind === "weekly"
        ? `${tx("schedule.weekly")}: ${sc.weekdays.map((d) => DAYS[d]).join("، ")}`
        : tx("schedule.date");
  return (
    <AccountShell>
      <h1>{tx("schedule.title")}</h1>
      <Guard {...session} />
      <Message error={error} success={saved} />
      {data && (
        <>
          <p className={s.notice} data-testid="family-followers">
            {tx("alerts.followers", { count: data.followers })}
          </p>
          <p className={s.muted}>{tx("schedule.intro")}</p>
          <form className={`${s.form} ${s.card}`} onSubmit={add}>
            <label className={s.field}>
              <span>{tx("schedule.product")}</span>
              <select
                value={productId || data.products[0]?.id || ""}
                onChange={(e) => setProductId(e.target.value)}
              >
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              <span>{tx("schedule.kind")}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="daily">{tx("schedule.daily")}</option>
                <option value="weekly">{tx("schedule.weekly")}</option>
                <option value="date">{tx("schedule.date")}</option>
              </select>
            </label>
            {kind === "weekly" && (
              <fieldset className={s.field}>
                <legend>{tx("schedule.days")}</legend>
                {DAYS.map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      checked={weekdays.includes(i)}
                      onChange={(e) =>
                        setWeekdays((w) =>
                          e.target.checked
                            ? [...w, i]
                            : w.filter((x) => x !== i),
                        )
                      }
                    />{" "}
                    {d}
                  </label>
                ))}
              </fieldset>
            )}
            <label className={s.field}>
              <span>{tx("schedule.start")}</span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className={s.button}
              disabled={!data.products.length}
            >
              {tx("schedule.add")}
            </button>
          </form>
          {data.schedules.length === 0 ? (
            <p className={s.muted}>{tx("schedule.none")}</p>
          ) : (
            <ul className={s.list} aria-label={tx("schedule.title")}>
              {data.schedules.map((sc) => (
                <li key={sc.id}>
                  <strong>{sc.productName}</strong> — {freq(sc)} ·{" "}
                  <bdi>{sc.startsOn}</bdi>{" "}
                  <button type="button" onClick={() => remove(sc.id)}>
                    {tx("schedule.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AccountShell>
  );
}
