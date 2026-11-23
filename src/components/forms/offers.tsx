"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import { DurationPicker } from "./duration-picker";
type Offer = {
  id: string;
  title: string;
  description: string;
  terms: string;
  price: number | null;
  productId: string | null;
  audience: string;
  meal: string;
  startsAt: string;
  /** null = دائم. */
  endsAt: string | null;
  enabled: boolean;
  producerName: string;
  producerSlug: string;
  /** «عروض أسرتي» فقط: الإحصائيات والحالة. */
  views?: number;
  orders?: number;
  state?: "active" | "scheduled" | "expired" | "disabled";
};
const STATES = {
  active: "يظهر الآن",
  scheduled: "لم يبدأ بعد",
  expired: "انتهى (مخفي، والإحصائيات باقية)",
  disabled: "معطّل",
};
const audiences = {
  general: "للجميع",
  students: "المهتمون بعروض الطلاب",
  employees: "المهتمون بعروض الموظفين",
  families: "المهتمون بعروض الأسر",
};
const meals = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "مناسبة",
};
const localTime = (value: string) => {
  const d = new Date(value);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
/** معاملات الرابط غير الفارغة فقط («?region=…&mine=…»، أو لا شيء). */
const query = (values: Record<string, string>) => {
  const qs = new URLSearchParams(
    Object.entries(values).filter(([, v]) => v),
  ).toString();
  return qs ? `?${qs}` : "";
};
export function Offers({
  manage = false,
  region = "",
  mine = "",
  scope,
}: {
  manage?: boolean;
  /** نطاق الزائر: عروض منطقته وما يُشحن لكل المناطق. */
  region?: string;
  /** اختيار المنطقة (من الصفحة). */
  scope?: React.ReactNode;
  /** فلاتر العضو المفعّلة (?mine=…). */
  mine?: string;
}) {
  const session = useSession();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Offer | null | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // بداية العرض في النموذج (لحساب النهاية بالساعات).
  const [start, setStart] = useState("");
  async function load() {
    const d = await api<{ offers: Offer[] }>(
      manage ? "/api/producer/offers" : `/api/offers${query({ region, mine })}`,
    );
    setOffers(d.offers);
    setLoaded(true);
  }
  useEffect(() => {
    if (!session.ready) return;
    if (manage && !session.user) return;
    load().catch((e) => setError(e.message));
    if (manage)
      api<{ products: { id: string; name: string }[] }>(
        "/api/producer/products",
      )
        .then((d) => setProducts(d.products))
        .catch((e) => setError(e.message));
    else if (session.user)
      api<{ groups: string[] }>("/api/offers/preferences")
        .then((d) => setGroups(d.groups))
        .catch((e) => setError(e.message));
  }, [session.ready, session.user, manage, region, mine]);
  async function savePreferences(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/offers/preferences", {
        method: "PUT",
        body: JSON.stringify({ groups }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/producer/offers", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          id: editing?.id,
          title: f.get("title"),
          description: f.get("description"),
          terms: f.get("terms"),
          price: f.get("price") === "" ? null : Number(f.get("price")),
          productId: f.get("productId") || null,
          audience: f.get("audience"),
          meal: f.get("meal"),
          startsAt: new Date(String(f.get("startsAt"))).toISOString(),
          endsAt: f.get("endsAt") ? String(f.get("endsAt")) : null,
          enabled: f.get("enabled") === "on",
        }),
      });
      await load();
      setEditing(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(offer: Offer) {
    setBusy(true);
    setError("");
    try {
      await api("/api/producer/offers", {
        method: "PATCH",
        body: JSON.stringify({
          id: offer.id,
          title: offer.title,
          description: offer.description,
          terms: offer.terms,
          price: offer.price,
          productId: offer.productId,
          audience: offer.audience,
          meal: offer.meal,
          startsAt: new Date(offer.startsAt).toISOString(),
          endsAt: offer.endsAt ? new Date(offer.endsAt).toISOString() : null,
          enabled: !offer.enabled,
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell navigation={manage}>
      <h1>{manage ? "عروض أسرتي" : "عروض الأسر المنتجة"}</h1>
      {!manage && scope}
      <p>
        الاتفاق والتحقق من شروط الاستحقاق والدفع مباشرة مع الأسرة المنتجة خارج
        الموقع.
      </p>
      {manage && <Guard {...session} />}
      <Message error={error} />
      {!manage &&
        (session.user ? (
          <form onSubmit={savePreferences} className={s.form}>
            <fieldset>
              <legend>اهتمامات العروض</legend>
              <p>
                اختيارك تصريح اهتمام شخصي، ولا يعني تحقق الموقع من صفة طالب أو
                موظف أو أي أهلية. تحدد الأسرة المنتجة شروط العرض وتتحقق منها
                مباشرة.
              </p>
              {Object.entries(audiences)
                .filter(([k]) => k !== "general")
                .map(([k, v]) => (
                  <label className={s.checks} key={k}>
                    <input
                      type="checkbox"
                      checked={groups.includes(k)}
                      onChange={(e) =>
                        setGroups(
                          e.target.checked
                            ? [...groups, k]
                            : groups.filter((g) => g !== k),
                        )
                      }
                    />
                    {v}
                  </label>
                ))}
            </fieldset>
            <button className={s.button} disabled={busy}>
              حفظ الاهتمامات وعرض المناسب
            </button>
          </form>
        ) : (
          <p>
            <Link href="/login">سجل الدخول</Link> لحفظ اهتماماتك والوصول إلى
            العروض الموجهة.
          </p>
        ))}
      {manage && session.user && (
        <>
          <button
            className={s.button}
            onClick={() => {
              setStart(localTime(new Date().toISOString()));
              setEditing(null);
            }}
          >
            إضافة عرض
          </button>
          {editing !== undefined && (
            <form
              className={s.form}
              style={{ minWidth: 0 }}
              onSubmit={save}
              key={editing?.id ?? "new"}
            >
              <h2>{editing ? "تعديل العرض" : "عرض جديد"}</h2>
              <label className={s.field}>
                عنوان العرض
                <input
                  name="title"
                  required
                  maxLength={120}
                  defaultValue={editing?.title}
                />
              </label>
              <label className={s.field}>
                وصف العرض
                <textarea
                  name="description"
                  maxLength={2000}
                  defaultValue={editing?.description}
                />
              </label>
              <label className={s.field}>
                الشروط والاستحقاق
                <textarea
                  name="terms"
                  required
                  maxLength={2000}
                  defaultValue={editing?.terms}
                />
              </label>
              <label className={s.field}>
                السعر بالريال (اختياري)
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  defaultValue={editing?.price ?? ""}
                />
              </label>
              <label className={s.field}>
                <span className="sr-only">المنتج المرتبط</span>
                <select
                  name="productId"
                  defaultValue={editing?.productId ?? ""}
                >
                  <option value="">المنتج المرتبط — بدون منتج</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                <span className="sr-only">جمهور العرض</span>
                <select
                  required
                  name="audience"
                  defaultValue={editing?.audience ?? ""}
                >
                  <option value="" disabled>
                    جمهور العرض
                  </option>
                  {Object.entries(audiences).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                <span className="sr-only">الوجبة</span>
                <select required name="meal" defaultValue={editing?.meal ?? ""}>
                  <option value="" disabled>
                    الوجبة أو المناسبة
                  </option>
                  {Object.entries(meals).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                بداية العرض
                <input
                  type="datetime-local"
                  name="startsAt"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <DurationPicker
                key={editing?.id ?? "new"}
                label="مدة صلاحية العرض"
                name="endsAt"
                start={start ? new Date(start).toISOString() : null}
                value={editing ? editing.endsAt : null}
              />
              <label className={s.checks}>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={editing?.enabled ?? false}
                />
                تفعيل العرض
              </label>
              <button className={s.button} disabled={busy}>
                حفظ العرض
              </button>
              <button
                className={s.button}
                type="button"
                onClick={() => setEditing(undefined)}
              >
                إلغاء
              </button>
            </form>
          )}
        </>
      )}
      {!loaded && !error && <p role="status">جارٍ تحميل العروض…</p>}
      {loaded && offers.length === 0 && <p>لا توجد عروض متاحة حاليًا.</p>}
      <div className={s.form}>
        {offers.map((o) => (
          <article
            key={o.id}
            className={s.notice}
            style={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            <h2>{o.title}</h2>
            <p>
              {o.producerName} · {meals[o.meal as keyof typeof meals]} ·{" "}
              {audiences[o.audience as keyof typeof audiences]}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{o.description}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>الشروط: {o.terms}</p>
            <p>
              {o.price === null
                ? "السعر بالاتفاق مع الأسرة المنتجة"
                : `${o.price} ريال`}
            </p>
            <p>
              {o.endsAt
                ? `من ${new Date(o.startsAt).toLocaleString("ar-SA")} إلى ${new Date(o.endsAt).toLocaleString("ar-SA")}`
                : `من ${new Date(o.startsAt).toLocaleString("ar-SA")} · دائم`}
            </p>
            {manage ? (
              <>
                <p className="offer-state" data-state={o.state}>
                  {o.state ? STATES[o.state] : o.enabled ? "مفعّل" : "معطّل"}
                </p>
                <p className="offer-stats" data-testid="offer-stats">
                  الإحصائيات: ظهر <strong>{o.views ?? 0}</strong> مرة ·{" "}
                  <strong>{o.orders ?? 0}</strong> طلب بالعرض
                </p>
                <button
                  className={s.button}
                  disabled={busy}
                  onClick={() => {
                    setStart(localTime(o.startsAt));
                    setEditing(o);
                  }}
                >
                  تعديل
                </button>{" "}
                <button
                  className={s.button}
                  disabled={busy}
                  onClick={() => toggle(o)}
                >
                  {o.enabled ? "تعطيل العرض" : "تفعيل العرض"}
                </button>
              </>
            ) : (
              <Link
                href={
                  o.productId
                    ? `/products/${o.productId}?offer=${o.id}`
                    : `/producers/${o.producerSlug}`
                }
              >
                {o.productId
                  ? "طلب المنتج بالعرض"
                  : "التواصل مع الأسرة المنتجة"}
              </Link>
            )}
          </article>
        ))}
      </div>
    </AccountShell>
  );
}
