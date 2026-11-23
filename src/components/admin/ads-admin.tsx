"use client";
import { useEffect, useRef, useState } from "react";
import { api, s as forms } from "@/components/forms/shared";
import { PLACEMENTS, PLACEMENT_IDS, WEEKDAYS, type Placement } from "@/lib/ads";
import { AdMediaPicker } from "./ad-media-picker";
import { DurationPicker } from "@/components/forms/duration-picker";
import css from "./ads-admin.module.css";

/**
 * «الإعلانات الترويجية» (من «أي خدمة»، AdminAdsPage وAdCampaigns): إعلانات الإدارة الآن.
 * تبويبات: الإعلانات (إضافة وتعديل وتنشيط وإيقاف وإلغاء وحذف، و«لماذا يظهر أو لا يظهر»)، والحملات،
 * والتقارير (المشاهدات والنقرات ونسبة النقر، وملف CSV). لكل حقل سطر شرح وزر (i) بتفصيل أكثر.
 */
type Ad = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  mediaId: string | null;
  mediaType: "image" | "video";
  placements: Placement[];
  status: "active" | "paused" | "cancelled" | "requested" | "approved";
  startsAt: string | null;
  endsAt: string | null;
  maxViews: number | null;
  dailyMaxViews: number | null;
  freqCapPerDay: number | null;
  priority: 1 | 2 | 3;
  weight: number;
  pacing: "asap" | "even";
  schedule: { days?: number[]; from?: string; to?: string } | null;
  targetRegions: string[];
  targetDevices: string[];
  targetAudience: string[];
  campaignId: string | null;
  campaignName: string | null;
  exclusive: boolean;
  viewsCount: number;
  clicksCount: number;
  todayViews: number;
};
type Campaign = {
  id: string;
  name: string;
  advertiser: string | null;
  notes: string | null;
  status: "active" | "paused";
  startsAt: string | null;
  endsAt: string | null;
  maxViews: number | null;
  dailyMaxViews: number | null;
  adsCount: number;
  viewsCount: number;
};
type Data = {
  ads: Ad[];
  campaigns: Campaign[];
  regions: { id: string; name: string }[];
};
const STATUS: Record<Ad["status"], string> = {
  active: "يعمل",
  paused: "موقوف",
  cancelled: "ملغى",
  requested: "طلب جديد",
  approved: "مقبول",
};
const AUDIENCE: Record<string, string> = {
  guest: "زائر بلا حساب",
  customer: "عميل",
  producer: "أسرة منتجة",
};
/** تاريخ الحقل (datetime-local بتوقيت الجهاز) ← ISO، وبالعكس. */
const toLocal = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const num = (v: string) =>
  v.trim() ? Math.max(1, Math.floor(Number(v))) || null : null;

/** شرح الحقل: سطر قصير، وزر (i) يفتح التفصيل (InfoTip في «أي خدمة»، AYK-415). */
function Help({ short, more }: { short: string; more?: string }) {
  return (
    <span className={css.help}>
      {short}
      {more && (
        <details className={css.info}>
          <summary aria-label="شرح مفصل">i</summary>
          <span>{more}</span>
        </details>
      )}
    </span>
  );
}

const blank = (): Partial<Ad> => ({
  title: "",
  description: "",
  link: "",
  placements: ["home_top"],
  priority: 2,
  weight: 1,
  pacing: "asap",
  targetRegions: [],
  targetDevices: [],
  targetAudience: [],
  exclusive: false,
  status: "active",
  mediaType: "image",
});

export function AdsAdmin() {
  const [tab, setTab] = useState<"ads" | "campaigns" | "reports">("ads");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<Partial<Ad> | null>(null);
  const load = () =>
    api<Data>("/api/admin/ads")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    void load();
  }, []);

  async function change(
    id: string,
    action: "activate" | "pause" | "cancel" | "delete",
  ) {
    const ask = {
      cancel: "إلغاء الإعلان نهائيًا؟ لا يعود للعمل بعد الإلغاء.",
      delete: "حذف الإعلان وصورته نهائيًا؟ تُحذف إحصاءاته أيضًا.",
    } as Record<string, string>;
    if (ask[action] && !window.confirm(ask[action])) return;
    setError("");
    try {
      setData(
        await api<Data>("/api/admin/ads", {
          method: "PATCH",
          body: JSON.stringify({ id, action }),
        }),
      );
      setMsg(
        {
          activate: "تم تنشيط الإعلان.",
          pause: "تم إيقاف الإعلان.",
          cancel: "تم إلغاء الإعلان.",
          delete: "تم حذف الإعلان.",
        }[action],
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className={css.page} aria-labelledby="ads-title">
      <h1 id="ads-title" className="sr-only">
        الإعلانات الترويجية
      </h1>
      <p className={css.intro}>
        إعلانات الإدارة تظهر في أماكنها بالموقع{" "}
        <strong>بلا كلمة «إعلان»</strong>، وفي كل إعلان زر ✕ صغير يخفيه الزائر
        عن جهازه. <br />
        <strong>الاشتراك بالإعلان (صفحة «أعلن» للأعضاء): الآن موقوف</strong> حتى
        تُختار طريقة الدفع.
      </p>
      <div className={css.tabs} role="tablist" aria-label="أقسام الإعلانات">
        {(
          [
            ["ads", "الإعلانات"],
            ["campaigns", "الحملات"],
            ["reports", "التقارير"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? css.tabOn : css.tab}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className={forms.error}>
          {error}
        </p>
      )}
      {msg && (
        <p role="status" className={forms.notice}>
          {msg}
        </p>
      )}
      {!data && !error && <p role="status">جارٍ التحميل…</p>}
      {data && tab === "ads" && (
        <>
          {editing ? (
            <AdForm
              ad={editing}
              data={data}
              onCancel={() => setEditing(null)}
              onSaved={(d, text) => {
                setData(d);
                setEditing(null);
                setMsg(text);
              }}
            />
          ) : (
            <button
              type="button"
              className={forms.button}
              onClick={() => {
                setMsg("");
                setEditing(blank());
              }}
            >
              ＋ إعلان جديد
            </button>
          )}
          {!editing && (
            <ul className={css.list} aria-label="الإعلانات">
              {data.ads.length === 0 && (
                <li className={forms.notice}>لا إعلانات بعد. أضف أول إعلان.</li>
              )}
              {data.ads.map((ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  onEdit={() => {
                    setMsg("");
                    setEditing(ad);
                  }}
                  onChange={(action) => void change(ad.id, action)}
                  onFix={(field) => {
                    setMsg("");
                    setEditing({ ...ad, focus: field } as Partial<Ad>);
                  }}
                  regions={data.regions}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {data && tab === "campaigns" && (
        <Campaigns data={data} onData={setData} />
      )}
      {data && tab === "reports" && <Reports campaigns={data.campaigns} />}
    </section>
  );
}

function AdCard({
  ad,
  onEdit,
  onChange,
  onFix,
  regions,
}: {
  ad: Ad;
  onEdit: () => void;
  onChange: (action: "activate" | "pause" | "cancel" | "delete") => void;
  onFix: (field: string) => void;
  regions: { id: string; name: string }[];
}) {
  const [why, setWhy] = useState<{
    live: boolean;
    checks: { ok: boolean; text: string; fix?: string }[];
  } | null>(null);
  const [region, setRegion] = useState("");
  async function check(r = region) {
    setWhy(
      await api(
        `/api/admin/ads/${ad.id}/why?${new URLSearchParams({ device: "mobile", audience: "guest", region: r })}`,
      ),
    );
  }
  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        {ad.mediaId ? (
          <div className={css.thumb}>
            {ad.mediaType === "video" ? (
              <video src={`/api/ads/media/${ad.mediaId}`} muted />
            ) : (
              // biome-ignore lint/performance/noImgElement: مصغّر الإعلان
              <img src={`/api/ads/media/${ad.mediaId}`} alt="" />
            )}
          </div>
        ) : (
          <div className={`${css.thumb} ${css.noThumb}`}>نص فقط</div>
        )}
        <div className={css.cardInfo}>
          <strong>{ad.title}</strong>
          <span className={css[`st_${ad.status}`] ?? css.st_paused}>
            {STATUS[ad.status]}
          </span>
          <small>
            {ad.placements.map((p) => PLACEMENTS[p]?.label ?? p).join("، ")}
          </small>
          <small>
            المشاهدات {ad.viewsCount}
            {ad.maxViews ? ` من ${ad.maxViews}` : ""} · اليوم {ad.todayViews} ·
            النقرات {ad.clicksCount}
            {ad.campaignName ? ` · حملة «${ad.campaignName}»` : ""}
          </small>
        </div>
      </div>
      <div className={forms.actions}>
        {ad.status !== "cancelled" && (
          <button
            type="button"
            className={forms.buttonSecondary}
            onClick={onEdit}
          >
            تعديل
          </button>
        )}
        {ad.status === "paused" && (
          <button
            type="button"
            className={forms.buttonSecondary}
            onClick={() => onChange("activate")}
          >
            تنشيط
          </button>
        )}
        {ad.status === "active" && (
          <button
            type="button"
            className={forms.buttonSecondary}
            onClick={() => onChange("pause")}
          >
            إيقاف
          </button>
        )}
        {ad.status !== "cancelled" && (
          <button
            type="button"
            className={forms.buttonSecondary}
            onClick={() => onChange("cancel")}
          >
            إلغاء
          </button>
        )}
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={() => onChange("delete")}
        >
          حذف
        </button>
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={() => void check()}
        >
          لماذا يظهر أو لا يظهر؟
        </button>
      </div>
      {why && (
        <section className={css.why} aria-label={`فحص ظهور «${ad.title}»`}>
          <p className={why.live ? css.whyOk : css.whyNo}>
            {why.live
              ? "✓ الإعلان يعمل الآن ويظهر في أماكنه لمن يناسبه الاستهداف."
              : "✗ الإعلان لا يظهر الآن. السبب في الشروط المعلَّمة:"}
          </p>
          <label className={forms.field}>
            افحص لزائر من منطقة
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                void check(e.target.value);
              }}
            >
              <option value="">لم يختر منطقة</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <ul>
            {why.checks.map((c) => (
              <li key={c.text} className={c.ok ? css.checkOk : css.checkNo}>
                <span aria-hidden="true">{c.ok ? "✓" : "✗"}</span> {c.text}
                {!c.ok && c.fix && (
                  <button
                    type="button"
                    className={forms.buttonSecondary}
                    onClick={() =>
                      c.fix === "activate"
                        ? onChange("activate")
                        : onFix(c.fix!)
                    }
                  >
                    {c.fix === "activate" ? "تنشيط الإعلان الآن" : "إصلاح"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </li>
  );
}

function AdForm({
  ad,
  data,
  onCancel,
  onSaved,
}: {
  ad: Partial<Ad> & { focus?: string };
  data: Data;
  onCancel: () => void;
  onSaved: (d: Data, text: string) => void;
}) {
  const [v, setV] = useState<Partial<Ad>>(ad);
  const [error, setError] = useState("");
  const [bad, setBad] = useState(ad.focus ?? "");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const set = <K extends keyof Ad>(k: K, value: Ad[K] | null) =>
    setV((x) => ({ ...x, [k]: value }));
  const toggle = (
    k: "placements" | "targetRegions" | "targetDevices" | "targetAudience",
    id: string,
  ) =>
    setV((x) => {
      const list = (x[k] as string[] | undefined) ?? [];
      return {
        ...x,
        [k]: list.includes(id) ? list.filter((i) => i !== id) : [...list, id],
      };
    });
  // «إصلاح» من الفحص، أو خطأ الحفظ: الخانة المانعة بإطار أحمر وتنتقل الشاشة إليها.
  useEffect(() => {
    if (!bad) return;
    const el = form.current?.querySelector<HTMLElement>(
      `[data-field="${bad}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input,select,textarea")?.focus();
  }, [bad]);
  const field = (name: string) => `${css.row} ${bad === name ? css.bad : ""}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const schedule =
        v.schedule &&
        ((v.schedule.days?.length ?? 0) > 0 ||
          (v.schedule.from && v.schedule.to))
          ? {
              days: v.schedule.days ?? [],
              from: v.schedule.from ?? "",
              to: v.schedule.to ?? "",
            }
          : null;
      const d = await api<Data>("/api/admin/ads", {
        method: "POST",
        body: JSON.stringify({
          ...(v.id ? { id: v.id } : {}),
          title: v.title ?? "",
          description: v.description ?? "",
          link: v.link ?? "",
          mediaId: v.mediaId ?? null,
          mediaType: v.mediaType ?? "image",
          placements: v.placements ?? [],
          startsAt: v.startsAt ?? null,
          endsAt: v.endsAt ?? null,
          maxViews: v.maxViews ?? null,
          dailyMaxViews: v.dailyMaxViews ?? null,
          freqCapPerDay: v.freqCapPerDay ?? null,
          priority: v.priority ?? 2,
          weight: v.weight ?? 1,
          pacing: v.pacing ?? "asap",
          schedule,
          targetRegions: v.targetRegions ?? [],
          targetDevices: v.targetDevices ?? [],
          targetAudience: v.targetAudience ?? [],
          campaignId: v.campaignId ?? null,
          exclusive: Boolean(v.exclusive),
          status: v.status === "paused" ? "paused" : "active",
        }),
      });
      onSaved(d, v.id ? "تم حفظ الإعلان." : "تمت إضافة الإعلان.");
    } catch (err) {
      const e2 = err as Error & { data?: { field?: string } };
      setError(e2.message);
      const name = e2.data?.field;
      if (name)
        setBad(
          ["targetRegions", "targetDevices", "targetAudience"].includes(name)
            ? "targeting"
            : name,
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={form}
      className={css.form}
      onSubmit={save}
      aria-label={v.id ? "تعديل الإعلان" : "إعلان جديد"}
    >
      <h2>{v.id ? "تعديل الإعلان" : "إعلان جديد"}</h2>
      <div className={field("title")} data-field="title">
        <label className={forms.field}>
          عنوان الإعلان
          <input
            value={v.title ?? ""}
            maxLength={200}
            required
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <Help short="يظهر على الصورة، أو وحده إن لم تكن صورة." />
      </div>
      <div className={field("description")} data-field="description">
        <label className={forms.field}>
          وصف قصير (اختياري)
          <textarea
            value={v.description ?? ""}
            maxLength={1000}
            rows={2}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <Help short="سطران على الأكثر يظهران تحت العنوان." />
      </div>
      <div className={field("link")} data-field="link">
        <label className={forms.field}>
          الرابط عند الضغط (اختياري)
          <input
            value={v.link ?? ""}
            dir="ltr"
            placeholder="/offers أو https://…"
            onChange={(e) => set("link", e.target.value)}
          />
        </label>
        <Help
          short="صفحة في الموقع تبدأ بـ / أو موقع خارجي يبدأ بـ https://"
          more="الرابط الخارجي يُفتح في نافذة جديدة. بلا رابط يُعرض الإعلان ولا يُضغط عليه."
        />
      </div>
      <div className={field("mediaId")} data-field="mediaId">
        <AdMediaPicker
          current={
            v.mediaId
              ? {
                  url: `/api/ads/media/${v.mediaId}`,
                  type: v.mediaType ?? "image",
                }
              : null
          }
          onUpload={async (file) => {
            const body = new FormData();
            body.append("file", file);
            const r = await api<{ id: string; mediaType: "image" | "video" }>(
              "/api/admin/ads/media",
              { method: "POST", body },
            );
            setV((x) => ({ ...x, mediaId: r.id, mediaType: r.mediaType }));
          }}
        />
      </div>
      <fieldset className={field("placements")} data-field="placements">
        <legend>أماكن الظهور</legend>
        <Help short="اختر مكانًا أو أكثر. كل مكان إطار عريض ثابت 1200×400." />
        <div className={css.choices}>
          {PLACEMENT_IDS.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={v.placements?.includes(p) ?? false}
                onChange={() => toggle("placements", p)}
              />{" "}
              {PLACEMENTS[p].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={css.two}>
        <div className={field("startsAt")} data-field="startsAt">
          <label className={forms.field}>
            يبدأ (اختياري)
            <input
              type="datetime-local"
              value={toLocal(v.startsAt ?? null)}
              onChange={(e) => set("startsAt", fromLocal(e.target.value))}
            />
          </label>
        </div>
        <div className={field("endsAt")} data-field="endsAt">
          <DurationPicker
            key={v.id ?? "new-ad"}
            label="مدة الإعلان"
            start={v.startsAt ?? null}
            value={v.endsAt ?? null}
            onChange={(endsAt) => set("endsAt", endsAt)}
          />
        </div>
      </div>
      <div className={css.three}>
        <div className={field("maxViews")} data-field="maxViews">
          <label className={forms.field}>
            حد المشاهدات الكلي
            <input
              inputMode="numeric"
              value={v.maxViews ?? ""}
              onChange={(e) => set("maxViews", num(e.target.value))}
            />
          </label>
          <Help short="يتوقف بعده. فارغ = بلا حد." />
        </div>
        <div className={field("dailyMaxViews")} data-field="dailyMaxViews">
          <label className={forms.field}>
            حد المشاهدات اليومي
            <input
              inputMode="numeric"
              value={v.dailyMaxViews ?? ""}
              onChange={(e) => set("dailyMaxViews", num(e.target.value))}
            />
          </label>
          <Help short="يتوقف حتى اليوم التالي بتوقيت الرياض." />
        </div>
        <div className={field("freqCapPerDay")} data-field="freqCapPerDay">
          <label className={forms.field}>
            حد لكل زائر في اليوم
            <input
              inputMode="numeric"
              value={v.freqCapPerDay ?? ""}
              onChange={(e) => set("freqCapPerDay", num(e.target.value))}
            />
          </label>
          <Help
            short="كم مرة يراه الزائر الواحد في اليوم."
            more="يُحسب على جهاز الزائر نفسه."
          />
        </div>
      </div>
      <div className={css.three}>
        <div className={field("priority")} data-field="priority">
          <label className={forms.field}>
            الأولوية
            <select
              value={v.priority ?? 2}
              onChange={(e) =>
                set("priority", Number(e.target.value) as Ad["priority"])
              }
            >
              <option value={1}>عالية</option>
              <option value={2}>عادية</option>
              <option value={3}>احتياطية</option>
            </select>
          </label>
          <Help short="العالية تظهر أولًا، والاحتياطية حين لا يوجد غيرها." />
        </div>
        <div className={field("weight")} data-field="weight">
          <label className={forms.field}>
            الوزن (1–10)
            <input
              inputMode="numeric"
              value={v.weight ?? 1}
              onChange={(e) =>
                set("weight", Math.min(10, num(e.target.value) ?? 1))
              }
            />
          </label>
          <Help
            short="نصيبه من الظهور بين إعلانات الأولوية نفسها."
            more="إعلان وزنه 3 مقابل إعلان وزنه 1 يأخذ نحو 75% من الظهور."
          />
        </div>
        <div className={field("pacing")} data-field="pacing">
          <label className={forms.field}>
            التوزيع
            <select
              value={v.pacing ?? "asap"}
              onChange={(e) => set("pacing", e.target.value as Ad["pacing"])}
            >
              <option value="asap">بأسرع ما يمكن</option>
              <option value="even">متساوٍ على المدة</option>
            </select>
          </label>
          <Help short="المتساوي يوزّع المشاهدات على الأيام، ويحتاج تاريخ نهاية وحد مشاهدات." />
        </div>
      </div>
      <fieldset className={field("schedule")} data-field="schedule">
        <legend>الجدولة الأسبوعية (اختيارية)</legend>
        <Help short="أيام وساعات الظهور بتوقيت السعودية. فارغة = كل الأوقات." />
        <div className={css.choices}>
          {WEEKDAYS.map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={v.schedule?.days?.includes(i) ?? false}
                onChange={() =>
                  setV((x) => {
                    const days = x.schedule?.days ?? [];
                    return {
                      ...x,
                      schedule: {
                        ...x.schedule,
                        days: days.includes(i)
                          ? days.filter((n) => n !== i)
                          : [...days, i],
                      },
                    };
                  })
                }
              />{" "}
              {d}
            </label>
          ))}
        </div>
        <div className={css.two}>
          <label className={forms.field}>
            من الساعة
            <input
              type="time"
              value={v.schedule?.from ?? ""}
              onChange={(e) =>
                setV((x) => ({
                  ...x,
                  schedule: { ...x.schedule, from: e.target.value },
                }))
              }
            />
          </label>
          <label className={forms.field}>
            إلى الساعة
            <input
              type="time"
              value={v.schedule?.to ?? ""}
              onChange={(e) =>
                setV((x) => ({
                  ...x,
                  schedule: { ...x.schedule, to: e.target.value },
                }))
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className={field("targeting")} data-field="targeting">
        <legend>الاستهداف (اختياري)</legend>
        <Help
          short="فارغ = الكل. المنطقة حسب «منطقة المائدة» التي اختارها الزائر."
          more="الزائر الذي لم يختر منطقته لا يرى إعلانًا مستهدفًا بمنطقة."
        />
        <p className={css.sub}>المناطق</p>
        <div className={css.choices}>
          {data.regions.map((r) => (
            <label key={r.id}>
              <input
                type="checkbox"
                checked={v.targetRegions?.includes(r.id) ?? false}
                onChange={() => toggle("targetRegions", r.id)}
              />{" "}
              {r.name}
            </label>
          ))}
        </div>
        <p className={css.sub}>الجهاز</p>
        <div className={css.choices}>
          {[
            ["mobile", "جوال"],
            ["desktop", "كمبيوتر"],
          ].map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={v.targetDevices?.includes(id) ?? false}
                onChange={() => toggle("targetDevices", id)}
              />{" "}
              {label}
            </label>
          ))}
        </div>
        <p className={css.sub}>الجمهور</p>
        <div className={css.choices}>
          {Object.entries(AUDIENCE).map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={v.targetAudience?.includes(id) ?? false}
                onChange={() => toggle("targetAudience", id)}
              />{" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={css.two}>
        <div className={field("campaignId")} data-field="campaignId">
          <label className={forms.field}>
            الحملة (اختيارية)
            <select
              value={v.campaignId ?? ""}
              onChange={(e) => set("campaignId", e.target.value || null)}
            >
              <option value="">بلا حملة</option>
              {data.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "paused" ? " (موقوفة)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Help short="تجمع إعلانات معلن واحد تحت مدة وحدود مشتركة." />
        </div>
        <div className={css.row}>
          <label className={css.check}>
            <input
              type="checkbox"
              checked={Boolean(v.exclusive)}
              onChange={(e) => set("exclusive", e.target.checked)}
            />{" "}
            حصري
          </label>
          <Help short="إن عمل في مكان يظهر وحده فيه، وتتنحى الإعلانات الأخرى." />
          <label className={css.check}>
            <input
              type="checkbox"
              checked={v.status === "paused"}
              onChange={(e) =>
                set("status", e.target.checked ? "paused" : "active")
              }
            />{" "}
            احفظه موقوفًا
          </label>
        </div>
      </div>
      {error && (
        <p role="alert" className={forms.error}>
          لم يُحفظ: {error}
        </p>
      )}
      <div className={css.bar}>
        <button type="submit" className={forms.button} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الإعلان"}
        </button>
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={onCancel}
        >
          رجوع
        </button>
      </div>
    </form>
  );
}

function Campaigns({
  data,
  onData,
}: {
  data: Data;
  onData: (d: Data) => void;
}) {
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      onData(
        await api<Data>("/api/admin/ads/campaigns", {
          method: "POST",
          body: JSON.stringify({
            ...(editing.id ? { id: editing.id } : {}),
            name: editing.name ?? "",
            advertiser: editing.advertiser ?? "",
            notes: editing.notes ?? "",
            status: editing.status ?? "active",
            startsAt: editing.startsAt ?? null,
            endsAt: editing.endsAt ?? null,
            maxViews: editing.maxViews ?? null,
            dailyMaxViews: editing.dailyMaxViews ?? null,
          }),
        }),
      );
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className={css.list}>
      <p className={css.intro}>
        الحملة تجمع إعلانات معلن واحد تحت مدة وحد مشاهدات كلي ويومي. إيقافها
        يوقف إعلاناتها، وحذفها لا يحذف إعلاناتها.
      </p>
      {editing ? (
        <form className={css.form} onSubmit={save} aria-label="الحملة">
          <label className={forms.field}>
            اسم الحملة
            <input
              required
              maxLength={150}
              value={editing.name ?? ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className={forms.field}>
            المعلن (اختياري)
            <input
              maxLength={150}
              value={editing.advertiser ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, advertiser: e.target.value })
              }
            />
          </label>
          <div className={css.two}>
            <label className={forms.field}>
              تبدأ
              <input
                type="datetime-local"
                value={toLocal(editing.startsAt ?? null)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    startsAt: fromLocal(e.target.value),
                  })
                }
              />
            </label>
            <DurationPicker
              key={editing.id ?? "new-campaign"}
              label="مدة الحملة"
              start={editing.startsAt ?? null}
              value={editing.endsAt ?? null}
              onChange={(endsAt) =>
                setEditing((e) => (e ? { ...e, endsAt } : e))
              }
            />
          </div>
          <div className={css.two}>
            <label className={forms.field}>
              حد المشاهدات الكلي
              <input
                inputMode="numeric"
                value={editing.maxViews ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, maxViews: num(e.target.value) })
                }
              />
            </label>
            <label className={forms.field}>
              حد المشاهدات اليومي
              <input
                inputMode="numeric"
                value={editing.dailyMaxViews ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, dailyMaxViews: num(e.target.value) })
                }
              />
            </label>
          </div>
          <label className={css.check}>
            <input
              type="checkbox"
              checked={editing.status === "paused"}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  status: e.target.checked ? "paused" : "active",
                })
              }
            />{" "}
            موقوفة
          </label>
          {error && (
            <p role="alert" className={forms.error}>
              {error}
            </p>
          )}
          <div className={forms.actions}>
            <button type="submit" className={forms.button}>
              حفظ الحملة
            </button>
            <button
              type="button"
              className={forms.buttonSecondary}
              onClick={() => setEditing(null)}
            >
              رجوع
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={forms.button}
          onClick={() => setEditing({ status: "active" })}
        >
          ＋ حملة جديدة
        </button>
      )}
      <ul className={css.list} aria-label="الحملات">
        {data.campaigns.map((c) => (
          <li key={c.id} className={css.card}>
            <strong>{c.name}</strong>
            <small>
              {c.status === "active" ? "تعمل" : "موقوفة"} · {c.adsCount} إعلان ·
              المشاهدات {c.viewsCount}
              {c.maxViews ? ` من ${c.maxViews}` : ""}
              {c.advertiser ? ` · ${c.advertiser}` : ""}
            </small>
            <div className={forms.actions}>
              <button
                type="button"
                className={forms.buttonSecondary}
                onClick={() => setEditing(c)}
              >
                تعديل
              </button>
              <button
                type="button"
                className={forms.buttonSecondary}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `حذف الحملة «${c.name}»؟ تبقى إعلاناتها بلا حملة.`,
                    )
                  )
                    return;
                  try {
                    onData(
                      await api<Data>(`/api/admin/ads/campaigns?id=${c.id}`, {
                        method: "DELETE",
                      }),
                    );
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reports({ campaigns }: { campaigns: Campaign[] }) {
  const day = (offset: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
      new Date(Date.now() - offset * 864e5),
    );
  const [from, setFrom] = useState(day(29));
  const [to, setTo] = useState(day(0));
  const [campaignId, setCampaignId] = useState("");
  const [report, setReport] = useState<{
    rows: {
      id: string;
      title: string;
      campaignName: string | null;
      views: number;
      clicks: number;
      ctr: number;
    }[];
    days: { day: string; views: number; clicks: number }[];
  } | null>(null);
  const [error, setError] = useState("");
  const query = new URLSearchParams({ from, to, campaignId }).toString();
  useEffect(() => {
    api<typeof report>(`/api/admin/ads/report?${query}`)
      .then((r) => {
        setReport(r);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [query]);
  const peak = Math.max(1, ...(report?.days.map((d) => d.views) ?? [1]));
  return (
    <div className={css.list}>
      <div className={css.three}>
        <label className={forms.field}>
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className={forms.field}>
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className={forms.field}>
          الحملة
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">كل الإعلانات</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className={forms.error}>
          {error}
        </p>
      )}
      {report && (
        <>
          {report.days.length > 0 && (
            <div className={css.bars} role="img" aria-label="المشاهدات يوميًا">
              {report.days.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day}: ${d.views} مشاهدة، ${d.clicks} نقرة`}
                  style={{ height: `${(d.views / peak) * 100}%` }}
                />
              ))}
            </div>
          )}
          {report.rows.length ? (
            <div className={css.tableWrap}>
              <table className={css.table} aria-label="أداء الإعلانات">
                <thead>
                  <tr>
                    <th>الإعلان</th>
                    <th>المشاهدات</th>
                    <th>النقرات</th>
                    <th>نسبة النقر</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        {i === 0 && (
                          <span className={css.best}>الأفضل أداءً</span>
                        )}{" "}
                        {r.title}
                        {r.campaignName && <small> · {r.campaignName}</small>}
                      </td>
                      <td>{r.views}</td>
                      <td>{r.clicks}</td>
                      <td>{r.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={forms.notice}>لا مشاهدات في هذه المدة.</p>
          )}
          <a
            className={forms.buttonSecondary}
            href={`/api/admin/ads/report?${query}&format=csv`}
            download
          >
            تحميل التقرير (CSV يفتح في Excel)
          </a>
        </>
      )}
    </div>
  );
}
