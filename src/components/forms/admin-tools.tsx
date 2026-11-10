"use client";
import { useEffect, useState } from "react";
import type { Category, City } from "@/lib/types";
import { categoryLabel, categoryParentOptions } from "@/lib/category-label";
import {
  siteTextLabels,
  siteTextTitleKeys,
  type SiteTextKey,
} from "@/lib/site-texts";
import { api, Message, s } from "./shared";
function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  async function refresh() {
    setData(await api<T>(url));
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [url]);
  async function write(method: string, body: unknown) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(url, { method, body: JSON.stringify(body) });
      await refresh();
      setSuccess("تم حفظ التغييرات.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { data, error, busy, success, write };
}
type AdminCategory = Category & {
  productCount?: number;
  childCount?: number;
  familyCount?: number;
};
export function CategoriesAdmin() {
  const r = useResource<{ categories: AdminCategory[] }>(
    "/api/admin/categories",
  );
  // "new" = نموذج قسم جديد، أو معرف القسم المفتوح تحت سطره مباشرة.
  const [openId, setOpenId] = useState("");
  const all = r.data?.categories ?? [];
  const toggle = (id: string) => setOpenId((v) => (v === id ? "" : id));
  return (
    <section>
      <h2>إدارة الأقسام</h2>
      <Message error={r.error} success={r.success} />
      <div className={`${s.card} ${s.categoryList}`}>
        <div className={s.categoryItem}>
          <button
            type="button"
            className={s.button}
            aria-expanded={openId === "new"}
            onClick={() => toggle("new")}
          >
            ＋ قسم جديد
          </button>
          {openId === "new" && (
            <CategoryEditor
              resource={r}
              all={all}
              onDone={() => setOpenId("")}
            />
          )}
        </div>
        {!r.data && !r.error && <p role="status">جارٍ تحميل الأقسام…</p>}
        {all.map((c) => (
          <div className={s.categoryItem} key={c.id}>
            <button
              type="button"
              className={s.categoryRow}
              aria-expanded={openId === c.id}
              onClick={() => toggle(c.id)}
            >
              <span>
                {c.icon} {categoryLabel(c, all)}
              </span>
              <small>
                {c.productCount ?? 0} منتج{" "}
                <span aria-hidden="true">{openId === c.id ? "▴" : "▾"}</span>
              </small>
            </button>
            {openId === c.id && (
              <CategoryEditor
                key={c.id}
                resource={r}
                all={all}
                category={c}
                onDone={() => setOpenId("")}
              />
            )}
          </div>
        ))}
        {r.data && !all.length && (
          <p className={s.notice}>لا توجد أقسام بعد.</p>
        )}
      </div>
    </section>
  );
}
function CategoryEditor({
  resource: r,
  all,
  category: editing,
  onDone,
}: {
  resource: ReturnType<typeof useResource<{ categories: AdminCategory[] }>>;
  all: AdminCategory[];
  category?: AdminCategory;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await r.write(editing ? "PATCH" : "POST", {
      id: editing?.id,
      name: f.get("name"),
      slug: f.get("slug"),
      icon: f.get("icon"),
      parentId: f.get("parentId") || null,
    });
    if (ok && !editing) onDone();
  }
  async function remove() {
    if (editing && (await r.write("DELETE", { id: editing.id }))) onDone();
  }
  const products = editing?.productCount ?? 0;
  const children = editing?.childCount ?? 0;
  const blocked = products > 0 || children > 0;
  return (
    <form onSubmit={save} className={s.form}>
      <div className={s.grid}>
        <label className={s.field}>
          اسم القسم
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={editing?.name}
          />
        </label>
        <label className={s.field}>
          الرابط المختصر
          <input
            name="slug"
            dir="ltr"
            required
            pattern="[a-z0-9\x2d]+"
            maxLength={100}
            title="حروف إنجليزية صغيرة وأرقام وشرطة فقط"
            defaultValue={editing?.slug}
          />
        </label>
        <label className={s.field}>
          الرمز
          <input
            name="icon"
            required
            maxLength={20}
            defaultValue={editing?.icon || "✦"}
          />
        </label>
        <label className={s.field}>
          القسم الرئيسي
          <select name="parentId" defaultValue={editing?.parentId || ""}>
            <option value="">قسم رئيسي مستقل</option>
            {categoryParentOptions(all, editing?.id).map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, all)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {editing && (
        <p className={s.muted}>
          {products} منتج · {children} قسم فرعي · {editing.familyCount ?? 0}{" "}
          أسرة اختارته
        </p>
      )}
      <div className={s.actions}>
        <button className={s.button} disabled={r.busy}>
          {r.busy ? "جارٍ الحفظ…" : editing ? "حفظ التعديل" : "حفظ التصنيف"}
        </button>
        {editing && !confirming && (
          <button
            type="button"
            className={s.danger}
            disabled={r.busy || blocked}
            onClick={() => setConfirming(true)}
          >
            حذف القسم
          </button>
        )}
        {editing && confirming && (
          <>
            <button
              type="button"
              className={s.danger}
              disabled={r.busy}
              onClick={remove}
            >
              تأكيد حذف «{editing.name}»
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => setConfirming(false)}
            >
              تراجع
            </button>
          </>
        )}
      </div>
      {editing && blocked && (
        <p className={s.notice}>
          لا يمكن حذف هذا القسم الآن:{" "}
          {products > 0 &&
            `احذف منتجاته أو انقلها لقسم آخر أولًا (${products} منتج). `}
          {children > 0 &&
            `احذف أقسامه الفرعية أو انقلها أولًا (${children} قسم).`}
        </p>
      )}
      {editing && confirming && (editing.familyCount ?? 0) > 0 && (
        <p className={s.notice}>
          سيُزال القسم من اختيارات {editing.familyCount} أسرة منتجة.
        </p>
      )}
    </form>
  );
}
type Locations = {
  regions: { id: string; name: string }[];
  cities: City[];
  neighborhoods: { id: string; name: string; cityId: string }[];
};
export function LocationsAdmin() {
  const r = useResource<Locations>("/api/admin/locations");
  const [kind, setKind] = useState("region");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (
      await r.write("POST", {
        kind,
        name: f.get("name"),
        regionId: f.get("regionId") || undefined,
        cityId: f.get("cityId") || undefined,
      })
    )
      form.reset();
  }
  return (
    <section>
      <h2>المناطق والمدن والأحياء</h2>
      <p className={s.muted}>
        كل مدينة ترتبط بمنطقة، وكل حي يرتبط بمدينة. تحقق من القوائم قبل إضافة
        اسم جديد.
      </p>
      <Message error={r.error} success={r.success} />
      <form onSubmit={save} className={`${s.card} ${s.form}`}>
        <label className={s.field}>
          <span className="sr-only">نوع الموقع</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="" disabled>
              اختر نوع الموقع
            </option>
            <option value="region">منطقة</option>
            <option value="city">مدينة</option>
            <option value="neighborhood">حي</option>
          </select>
        </label>
        {kind === "city" && (
          <label className={s.field}>
            <span className="sr-only">المنطقة</span>
            <select name="regionId" required defaultValue="">
              <option value="" disabled>
                اختر المنطقة
              </option>
              {r.data?.regions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "neighborhood" && (
          <label className={s.field}>
            <span className="sr-only">المدينة</span>
            <select name="cityId" required defaultValue="">
              <option value="" disabled>
                اختر المدينة
              </option>
              {r.data?.cities.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.regionName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={s.field}>
          الاسم
          <input name="name" required maxLength={120} />
        </label>
        <button className={s.button} disabled={r.busy || !r.data}>
          {r.busy ? "جارٍ الحفظ…" : "إضافة الموقع"}
        </button>
      </form>
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل المواقع…</p>
      ) : !r.data?.regions.length ? (
        <p className={s.notice}>لا توجد مناطق مسجلة.</p>
      ) : (
        r.data.regions.map((region) => (
          <article className={s.card} key={region.id}>
            <h3>{region.name}</h3>
            {r.data?.cities
              .filter((c) => c.regionId === region.id)
              .map((city) => (
                <div key={city.id}>
                  <h4>{city.name}</h4>
                  <p>
                    {r.data?.neighborhoods
                      .filter((n) => n.cityId === city.id)
                      .map((n) => n.name)
                      .join(" · ") || "لا توجد أحياء مسجلة"}
                  </p>
                </div>
              ))}
          </article>
        ))
      )}
    </section>
  );
}
type ModeratedProduct = {
  id: string;
  name: string;
  producerName: string;
  cityName: string;
  status: string;
  visible: boolean;
  featured: boolean;
  categoryIds?: string[];
};
function ProductModeration({
  product,
  categories,
  busy,
  onSave,
}: {
  product: ModeratedProduct;
  categories: Category[];
  busy: boolean;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  return (
    <form
      className={`${s.card} ${s.form}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSave({
          id: product.id,
          visible: f.has("visible"),
          featured: f.has("featured"),
          categoryIds: f.getAll("categoryIds"),
          reason: f.get("reason"),
        });
      }}
    >
      <h3>{product.name}</h3>
      <p>
        {product.producerName} · {product.cityName}
      </p>
      <div className={s.checks}>
        <label>
          <input
            name="visible"
            type="checkbox"
            defaultChecked={product.visible}
          />
          ظاهر في المنصة
        </label>
        <label>
          <input
            name="featured"
            type="checkbox"
            defaultChecked={product.featured}
          />
          منتج مميز
        </label>
      </div>
      <fieldset>
        <legend>التصنيفات المناسبة</legend>
        <div className={s.checks}>
          {categories.map((c) => (
            <label key={c.id}>
              <input
                name="categoryIds"
                type="checkbox"
                value={c.id}
                defaultChecked={product.categoryIds?.includes(c.id)}
              />
              {categoryLabel(c, categories)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={s.field}>
        سبب التغيير
        <textarea name="reason" required minLength={3} maxLength={2000} />
      </label>
      <button className={s.button} disabled={busy}>
        حفظ إشراف المنتج
      </button>
    </form>
  );
}
export function ProductsAdmin() {
  const r = useResource<{ products: ModeratedProduct[] }>(
    "/api/admin/products",
  );
  const c = useResource<{ categories: Category[] }>("/api/admin/categories");
  return (
    <section>
      <h2>الإشراف على المنتجات</h2>
      <Message error={r.error || c.error} success={r.success} />
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل المنتجات…</p>
      ) : r.data?.products.length ? (
        r.data.products.map((p) => (
          <ProductModeration
            key={`${p.id}-${p.visible}-${p.featured}-${p.categoryIds?.join()}`}
            product={p}
            categories={c.data?.categories || []}
            busy={r.busy || !c.data}
            onSave={(body) => r.write("PATCH", body)}
          />
        ))
      ) : (
        <p className={s.notice}>لا توجد منتجات للمراجعة.</p>
      )}
    </section>
  );
}
type Report = {
  id: string;
  status: string;
  reason: string;
  productId?: string;
  producerId?: string;
  productName?: string;
  producerName?: string;
  createdAt?: string;
};
export function ReportsAdmin() {
  const r = useResource<{ reports: Report[] }>("/api/admin/reports");
  return (
    <section>
      <h2>البلاغات والشكاوى</h2>
      <Message error={r.error} success={r.success} />
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل البلاغات…</p>
      ) : r.data?.reports.length ? (
        r.data.reports.map((report) => (
          <form
            key={`${report.id}-${report.status}`}
            className={`${s.card} ${s.form}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await r.write("PATCH", {
                id: report.id,
                status: f.get("status"),
                reason: f.get("reason"),
              });
            }}
          >
            <h3>بلاغ {report.id.slice(0, 8)}</h3>
            <p>{report.reason}</p>
            <p>
              {report.productName} {report.producerName}
            </p>
            <label className={s.field}>
              <span className="sr-only">الحالة</span>
              <select name="status" defaultValue={report.status}>
                <option value="new">حالة البلاغ: جديد</option>
                <option value="reviewing">حالة البلاغ: قيد المراجعة</option>
                <option value="resolved">حالة البلاغ: تم الحل</option>
                <option value="dismissed">حالة البلاغ: مستبعد</option>
              </select>
            </label>
            <label className={s.field}>
              سبب الإجراء
              <textarea name="reason" required minLength={3} maxLength={2000} />
            </label>
            <button className={s.button} disabled={r.busy}>
              حفظ إجراء البلاغ
            </button>
          </form>
        ))
      ) : (
        <p className={s.notice}>لا توجد بلاغات حاليًا.</p>
      )}
    </section>
  );
}
const meals: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "مناسبة",
};
const orderStatus: Record<string, string> = {
  pending: "جديد بانتظار الأسرة المنتجة",
  accepted: "مقبول",
  preparing: "قيد التجهيز",
  ready: "جاهز",
  completed: "تم التسليم",
  declined: "اعتذرت الأسرة المنتجة",
  cancelled: "ملغى",
};
type Summary = Record<string, number>;
export function AdminSummary({ onOpen }: { onOpen: (tab: string) => void }) {
  const r = useResource<{ summary: Summary }>("/api/admin/summary");
  const v = r.data?.summary;
  const cards: [string, string, string, boolean?][] = v
    ? [
        [
          "أسر تحت المراجعة",
          String(v.familiesPending),
          "producers",
          v.familiesPending > 0,
        ],
        ["أسر بانتظار الاستكمال", String(v.familiesIncomplete), "producers"],
        ["أسر نشطة", String(v.familiesApproved), "producers"],
        ["بلاغات مفتوحة", String(v.reportsOpen), "reports", v.reportsOpen > 0],
        ["طلبات آخر 24 ساعة", String(v.ordersToday), "orders"],
        [
          "طلبات بلا رد منذ 24 ساعة",
          String(v.ordersStale),
          "orders",
          v.ordersStale > 0,
        ],
        ["منتجات ظاهرة", String(v.productsLive), "products"],
      ]
    : [];
  return (
    <section aria-label="ملخص الإدارة" className={s.summaryGrid}>
      {r.error && <Message error={r.error} />}
      {!v && !r.error && <p role="status">جارٍ تحميل الملخص…</p>}
      {cards.map(([label, value, tab, alert]) => (
        <button
          type="button"
          key={label}
          className={`${s.summaryCard} ${alert ? s.summaryAlert : ""}`}
          onClick={() => onOpen(tab)}
        >
          <strong>{value}</strong>
          <span>{label}</span>
        </button>
      ))}
    </section>
  );
}
type AdminOrder = {
  id: string;
  status: string;
  productName: string;
  producerName: string;
  producerSlug: string;
  customerName: string;
  phone: string;
  quantity: number;
  meal: string;
  startDate: string;
  createdAt: string;
  stale: boolean;
};
export function OrdersAdmin() {
  const r = useResource<{ orders: AdminOrder[] }>("/api/admin/orders");
  const [filter, setFilter] = useState("open");
  const open = ["pending", "accepted", "preparing", "ready"];
  const list = (r.data?.orders ?? []).filter((o) =>
    filter === "all"
      ? true
      : filter === "stale"
        ? o.stale
        : filter === "open"
          ? open.includes(o.status)
          : !open.includes(o.status),
  );
  return (
    <section>
      <h2>متابعة الطلبات</h2>
      <p className={s.muted}>
        للاطلاع والمتابعة فقط؛ الأسرة المنتجة تدير حالة طلبها. الاتفاق والسداد
        خارج الموقع.
      </p>
      <Message error={r.error} />
      <div className={s.actions} role="group" aria-label="تصفية الطلبات">
        {[
          ["open", "قيد التنفيذ"],
          ["stale", "بلا رد منذ 24 ساعة"],
          ["done", "منتهية"],
          ["all", "الكل"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={s.buttonSecondary}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل الطلبات…</p>
      ) : list.length ? (
        list.map((o) => (
          <article
            key={o.id}
            className={`${s.card} ${o.stale ? s.cardNew : ""}`}
          >
            <div className={s.orderHead}>
              <h3>{o.productName}</h3>
              <span className={o.stale ? s.tagNew : s.tag}>
                {o.stale
                  ? "بلا رد +24 ساعة"
                  : (orderStatus[o.status] ?? o.status)}
              </span>
            </div>
            <p>
              الأسرة المنتجة:{" "}
              <a href={`/producers/${o.producerSlug}`}>{o.producerName}</a>
            </p>
            <p>
              العميل: {o.customerName} —{" "}
              <a href={`tel:${o.phone}`} dir="ltr">
                {o.phone}
              </a>
            </p>
            <p>
              {o.quantity} · {meals[o.meal] ?? o.meal} · من{" "}
              <bdi>{o.startDate}</bdi> · أُرسل{" "}
              <bdi>{new Date(o.createdAt).toLocaleString("ar-SA")}</bdi>
            </p>
          </article>
        ))
      ) : (
        <p className={s.notice}>لا توجد طلبات في هذا التصنيف.</p>
      )}
    </section>
  );
}
/** قالب الواجهة: الباب النجدي أو الكلاسيكي، ويسري فورًا على كل الصفحات. */
export function TemplateAdmin() {
  const r = useResource<{ template: "najdi" | "classic" }>(
    "/api/admin/settings",
  );
  const options = [
    [
      "najdi",
      "الباب النجدي",
      "جدار طين وباب ونوافذ خشب، والأقسام نوافذ، والتوفر أبواب.",
    ],
    [
      "classic",
      "الكلاسيكي",
      "القوس النجدي وطبق الخوص وصور الأطباق، كما كان الموقع.",
    ],
  ] as const;
  return (
    <section>
      <h2>قالب الموقع</h2>
      <Message error={r.error} success={r.success} />
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل القالب…</p>
      ) : (
        <fieldset className={`${s.card} ${s.form}`}>
          <legend>اختر قالب الواجهة</legend>
          {options.map(([id, label, hint]) => (
            <label key={id} className={s.field}>
              <span>
                <input
                  type="radio"
                  name="template"
                  value={id}
                  checked={r.data?.template === id}
                  disabled={r.busy}
                  onChange={() => r.write("PUT", { template: id })}
                />{" "}
                <strong>{label}</strong>
                {r.data?.template === id ? " (المفعّل)" : ""}
              </span>
              <small>{hint}</small>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
type AdminText = {
  key: string;
  value: string;
  original: string;
  edited: boolean;
  hidden: boolean;
};
/** نصوص الموقع: تعديل أي نص ظاهر، أو حذفه، أو إعادته للأصل. */
export function TextsAdmin() {
  const r = useResource<{ texts: AdminText[] }>("/api/admin/texts");
  const groups = new Map<string, AdminText[]>();
  for (const t of r.data?.texts ?? []) {
    const [group] = siteTextLabels[t.key as SiteTextKey] ?? ["أخرى", t.key];
    groups.set(group, [...(groups.get(group) ?? []), t]);
  }
  return (
    <section>
      <h2>نصوص الموقع</h2>
      <p className={s.muted}>
        عدّل النص واحفظه، أو أخفِ العنوان أو النص مؤقتًا دون أن يُمسح، أو احذفه،
        أو أعده لأصله. العناوين والأزرار الأساسية تعود لنصها الأصلي إذا حُذفت أو
        أُخفيت.
      </p>
      <Message error={r.error} success={r.success} />
      {!r.data && !r.error && <p role="status">جارٍ تحميل النصوص…</p>}
      {[...groups].map(([group, items]) => (
        <fieldset key={group} className={`${s.card} ${s.form}`}>
          <legend>{group}</legend>
          {items.map((t) => (
            <TextRow key={t.key + t.value + t.hidden} item={t} resource={r} />
          ))}
        </fieldset>
      ))}
    </section>
  );
}
function TextRow({
  item,
  resource: r,
}: {
  item: AdminText;
  resource: ReturnType<typeof useResource<{ texts: AdminText[] }>>;
}) {
  const label = siteTextLabels[item.key as SiteTextKey]?.[1] ?? item.key;
  const id = "text-" + item.key.replace(/\W/g, "-");
  const [draft, setDraft] = useState(item.value);
  const [hidden, setHidden] = useState(item.hidden);
  const status = [
    item.hidden ? "مخفي" : "",
    !item.edited ? "" : item.value === "" ? "محذوف" : "معدّل",
  ]
    .filter(Boolean)
    .join("، ");
  const hideLabel = siteTextTitleKeys.has(item.key as SiteTextKey)
    ? "إخفاء العنوان"
    : "إخفاء النص";
  return (
    <div className={s.field}>
      <label htmlFor={id}>
        {label}
        {status && <small> ({status})</small>}
      </label>
      <textarea
        id={id}
        rows={item.original.length > 60 ? 3 : 1}
        maxLength={2000}
        value={draft}
        placeholder={item.value === "" ? "محذوف — لا يظهر في الموقع" : ""}
        onChange={(e) => setDraft(e.target.value)}
      />
      <label className={s.hideToggle}>
        <input
          type="checkbox"
          checked={hidden}
          disabled={r.busy}
          aria-describedby={id}
          onChange={(e) => {
            setHidden(e.target.checked);
            r.write("PUT", { key: item.key, hidden: e.target.checked });
          }}
        />
        {hideLabel}
      </label>
      <div className={s.actions}>
        <button
          type="button"
          className={s.button}
          disabled={r.busy || draft === item.value}
          onClick={() => r.write("PUT", { key: item.key, value: draft })}
        >
          حفظ «{label}»
        </button>
        <button
          type="button"
          className={s.danger}
          disabled={r.busy || item.value === ""}
          onClick={() => r.write("PUT", { key: item.key, value: "" })}
        >
          حذف «{label}»
        </button>
        {item.edited && (
          <button
            type="button"
            className={s.buttonSecondary}
            disabled={r.busy}
            onClick={() => r.write("PUT", { key: item.key, value: null })}
          >
            استعادة الأصل
          </button>
        )}
      </div>
    </div>
  );
}
