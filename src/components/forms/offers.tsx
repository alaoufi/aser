"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
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
  endsAt: string;
  enabled: boolean;
  producerName: string;
  producerSlug: string;
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
export function Offers({ manage = false }: { manage?: boolean }) {
  const session = useSession();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Offer | null | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  async function load() {
    const d = await api<{ offers: Offer[] }>(
      manage ? "/api/producer/offers" : "/api/offers",
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
  }, [session.ready, session.user, manage]);
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
          endsAt: new Date(String(f.get("endsAt"))).toISOString(),
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
          ...offer,
          startsAt: new Date(offer.startsAt).toISOString(),
          endsAt: new Date(offer.endsAt).toISOString(),
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
          <button className={s.button} onClick={() => setEditing(null)}>
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
                  defaultValue={editing ? localTime(editing.startsAt) : ""}
                />
              </label>
              <label className={s.field}>
                نهاية العرض
                <input
                  type="datetime-local"
                  name="endsAt"
                  required
                  defaultValue={editing ? localTime(editing.endsAt) : ""}
                />
              </label>
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
              من {new Date(o.startsAt).toLocaleString("ar-SA")} إلى{" "}
              {new Date(o.endsAt).toLocaleString("ar-SA")}
            </p>
            {manage ? (
              <>
                <p>{o.enabled ? "مفعّل" : "معطّل"}</p>
                <button
                  className={s.button}
                  disabled={busy}
                  onClick={() => setEditing(o)}
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
