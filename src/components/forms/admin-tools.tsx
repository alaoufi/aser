"use client";
import { Fragment, useEffect, useState } from "react";
import type { Category, City } from "@/lib/types";
import { categoryLabel, categoryParentOptions } from "@/lib/category-label";
import {
  siteTextLabels,
  siteTextParagraphs,
  siteTextTitleKeys,
  type SiteTextKey,
} from "@/lib/site-texts";
import { api, Message, s } from "./shared";
import { adminCache, fetchAdmin } from "./admin-cache";
export { prefetchAdmin } from "./admin-cache";
import {
  productFieldKeys,
  productFieldLabels,
  type ProductFields,
  type ProductFieldState,
} from "@/lib/product-fields";
function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(
    () => (adminCache.get(url) as T | undefined) ?? null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  async function refresh() {
    setData(await fetchAdmin<T>(url));
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
  return { data, error, busy, success, write, refresh, setError, setSuccess };
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
            <div className={s.categoryLine}>
              <button
                type="button"
                className={s.categoryRow}
                aria-expanded={openId === c.id}
                onClick={() => toggle(c.id)}
              >
                <span>
                  {c.icon} {categoryLabel(c, all)}
                  {c.hidden && <em className={s.hiddenTag}> · مخفي</em>}
                </span>
                <small>
                  {c.productCount ?? 0} منتج{" "}
                  <span aria-hidden="true">{openId === c.id ? "▴" : "▾"}</span>
                </small>
              </button>
              <div className={s.productActions}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-label={`تعديل قسم ${c.name}`}
                >
                  تعديل
                </button>
                <button
                  type="button"
                  disabled={r.busy}
                  onClick={() =>
                    r.write("PUT", { id: c.id, hidden: !c.hidden })
                  }
                  aria-label={`${c.hidden ? "إظهار" : "إخفاء"} قسم ${c.name}`}
                >
                  {c.hidden ? "إظهار" : "إخفاء"}
                </button>
                <button
                  type="button"
                  className={s.deleteAction}
                  disabled={r.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `حذف قسم «${c.name}»؟ لا يُحذف إلا إذا لم تبقَ فيه منتجات ولا أقسام فرعية؛ أو أخفِه بدلًا من ذلك.`,
                      )
                    )
                      r.write("DELETE", { id: c.id });
                  }}
                  aria-label={`حذف قسم ${c.name}`}
                >
                  حذف
                </button>
              </div>
            </div>
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
        {editing && (
          <button
            type="button"
            className={s.buttonSecondary}
            disabled={r.busy}
            onClick={() =>
              r.write("PUT", { id: editing.id, hidden: !editing.hidden })
            }
          >
            {editing.hidden ? "إظهار القسم" : "إخفاء القسم"}
          </button>
        )}
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
  producerId: string;
  producerName: string;
  producerSlug?: string;
  producerStatus?: string;
  cityName: string;
  status: string;
  visible: boolean;
  hiddenBy?: "admin" | "family" | null;
  featured: boolean;
  categoryIds?: string[];
};
/** يطلب سبب الإجراء (يُحفظ في سجل الإدارة)؛ الإلغاء يعيد null. */
function askReason(question: string, fallback: string) {
  const v = window.prompt(
    `${question}\nاكتب السبب (يُحفظ في سجل الإدارة):`,
    fallback,
  );
  if (v === null) return null;
  return v.trim().length >= 5 ? v.trim() : fallback;
}
function ProductCategories({
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
      aria-label={`أقسام ${product.name}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSave({
          id: product.id,
          categoryIds: f.getAll("categoryIds"),
          reason: "نقل المنتج إلى القسم المناسب",
        });
      }}
    >
      <fieldset>
        <legend>أقسام «{product.name}»</legend>
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
      <button className={s.button} disabled={busy}>
        حفظ الأقسام
      </button>
    </form>
  );
}
/**
 * «المنتجات» في الإدارة: كل منتجات الأسر في الموقع، وأمام كل منتج
 * عرض، إخفاء/إظهار، تمييز، نقل القسم، حذف، وإيقاف الأسرة المخالفة.
 */
export function ProductsAdmin() {
  const r = useResource<{ products: ModeratedProduct[] }>(
    "/api/admin/products",
  );
  const c = useResource<{ categories: Category[] }>("/api/admin/categories");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const all = r.data?.products ?? [];
  const [show, setShow] = useState<"all" | "visible" | "hidden" | "featured">(
    "all",
  );
  const q = query.trim();
  const list = all
    .filter((p) => !q || p.name.includes(q) || p.producerName.includes(q))
    .filter((p) =>
      show === "visible"
        ? p.visible
        : show === "hidden"
          ? !p.visible
          : show === "featured"
            ? p.featured
            : true,
    );
  const busy = r.busy;
  async function blockFamily(p: ModeratedProduct) {
    const reason = askReason(
      `إيقاف أسرة «${p.producerName}»؟ تختفي كل منتجاتها من الموقع ولا تستقبل طلبات حتى تُعاد من «مراجعة الأسر».`,
      "مخالفة شروط المنصة",
    );
    if (!reason) return;
    r.setError("");
    r.setSuccess("");
    try {
      await api(`/api/admin/producers/${p.producerId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: "suspended", reason }),
      });
      await r.refresh();
      r.setSuccess(`أُوقفت أسرة «${p.producerName}».`);
    } catch (e) {
      r.setError((e as Error).message);
    }
  }
  return (
    <section aria-labelledby="admin-products-title">
      <h2 id="admin-products-title">المنتجات</h2>
      <p className={s.muted}>
        هنا كل منتجات الأسر المنشورة في الموقع، لمراقبة المحتوى وإدارته. أمام كل
        منتج: <strong>عرض</strong> صفحته، <strong>إخفاء</strong> عن الزوار (لا
        تستطيع الأسرة إظهاره)، <strong>تمييز</strong> في الواجهة، تغيير
        <strong> القسم</strong>، <strong>حذف</strong> نهائي من الموقع، و
        <strong>حظر الأسرة</strong> المخالفة فتختفي كل منتجاتها.
      </p>
      <Message error={r.error || c.error} success={r.success} />
      <label className={s.field}>
        بحث باسم المنتج أو الأسرة
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className={s.filterChips} role="group" aria-label="عرض المنتجات">
        {(
          [
            ["all", "الكل"],
            ["visible", "الظاهرة"],
            ["hidden", "المخفية"],
            ["featured", "المميزة"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={show === v}
            onClick={() => setShow(v)}
          >
            {label} (
            {v === "all"
              ? all.length
              : all.filter((p) =>
                  v === "visible"
                    ? p.visible
                    : v === "hidden"
                      ? !p.visible
                      : p.featured,
                ).length}
            )
          </button>
        ))}
      </div>
      {!r.data && !r.error ? (
        <p role="status">جارٍ تحميل المنتجات…</p>
      ) : list.length ? (
        <div className={s.tableWrap}>
          <table className={s.adminTable}>
            <thead>
              <tr>
                <th scope="col">اسم المنتج</th>
                <th scope="col">الأسرة المنتجة</th>
                <th scope="col">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const blocked = p.producerStatus === "suspended";
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>
                        <strong>{p.name}</strong>
                        {!p.visible && (
                          <em className={s.hiddenTag}>
                            {p.hiddenBy === "family"
                              ? "أخفته الأسرة"
                              : "مخفي من الإدارة"}
                          </em>
                        )}
                        {p.featured && <em className={s.hiddenTag}>مميز</em>}
                      </td>
                      <td>
                        {p.producerSlug ? (
                          <a
                            href={`/producers/${p.producerSlug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {p.producerName}
                          </a>
                        ) : (
                          p.producerName
                        )}
                        <small>{p.cityName}</small>
                        {blocked && (
                          <em className={s.hiddenTag}>الأسرة موقوفة</em>
                        )}
                      </td>
                      <td>
                        <div className={s.productActions}>
                          <a
                            href={`/products/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`عرض ${p.name}`}
                          >
                            عرض
                          </a>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${p.visible ? "إخفاء" : "إظهار"} ${p.name}`}
                            onClick={() => {
                              const reason = p.visible
                                ? askReason(
                                    `إخفاء «${p.name}» عن الزوار؟`,
                                    "مخالفة المحتوى",
                                  )
                                : "إظهار المنتج بعد المراجعة";
                              if (reason)
                                r.write("PATCH", {
                                  id: p.id,
                                  visible: !p.visible,
                                  reason,
                                });
                            }}
                          >
                            {p.visible ? "إخفاء" : "إظهار"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${p.featured ? "إلغاء تمييز" : "تمييز"} ${p.name}`}
                            onClick={() =>
                              r.write("PATCH", {
                                id: p.id,
                                featured: !p.featured,
                                reason: p.featured
                                  ? "إلغاء تمييز المنتج"
                                  : "تمييز المنتج في الواجهة",
                              })
                            }
                          >
                            {p.featured ? "إلغاء التمييز" : "تمييز"}
                          </button>
                          <button
                            type="button"
                            aria-expanded={openId === p.id}
                            aria-label={`أقسام ${p.name}`}
                            onClick={() =>
                              setOpenId(openId === p.id ? "" : p.id)
                            }
                          >
                            القسم
                          </button>
                          <button
                            type="button"
                            className={s.deleteAction}
                            disabled={busy}
                            aria-label={`حذف ${p.name}`}
                            onClick={() => {
                              const reason = askReason(
                                `حذف «${p.name}» نهائيًا من الموقع؟`,
                                "مخالفة المحتوى",
                              );
                              if (reason)
                                r.write("PATCH", {
                                  id: p.id,
                                  deleted: true,
                                  reason,
                                });
                            }}
                          >
                            حذف
                          </button>
                          {!blocked && (
                            <button
                              type="button"
                              className={s.deleteAction}
                              disabled={busy}
                              aria-label={`حظر أسرة ${p.producerName}`}
                              onClick={() => blockFamily(p)}
                            >
                              حظر الأسرة
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {openId === p.id && (
                      <tr>
                        <td colSpan={3}>
                          <ProductCategories
                            key={p.categoryIds?.join()}
                            product={p}
                            categories={c.data?.categories || []}
                            busy={busy || !c.data}
                            onSave={(body) => r.write("PATCH", body)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={s.notice}>
          {q ? "لا توجد منتجات بهذا الاسم." : "لا توجد منتجات بعد."}
        </p>
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
        أو أعده لأصله. الأزرار الأساسية تعود لنصها الأصلي إذا حُذفت أو أُخفيت.
      </p>
      <Message error={r.error} success={r.success} />
      {!r.data && !r.error && <p role="status">جارٍ تحميل النصوص…</p>}
      {[...groups].map(([group, items]) => (
        <fieldset key={group} className={`${s.card} ${s.form}`}>
          <legend>{group}</legend>
          {items.map((t) => {
            const key = t.key as SiteTextKey;
            // فقرة: عنوانها ونصها في بطاقة واحدة، وخيارا الإخفاء متجاوران أعلاها.
            const textKey = siteTextParagraphs.get(key);
            const text = textKey && items.find((x) => x.key === textKey);
            if (text)
              return (
                <div key={t.key} className={s.paragraphCard}>
                  <div
                    className={s.hideBar}
                    role="group"
                    aria-label={"إخفاء " + siteTextLabels[key][1]}
                  >
                    <HideToggle item={t} resource={r} label="إخفاء العنوان" />
                    <HideToggle item={text} resource={r} label="إخفاء النص" />
                  </div>
                  <TextRow item={t} resource={r} toggle={false} />
                  <TextRow item={text} resource={r} toggle={false} />
                </div>
              );
            if ([...siteTextParagraphs.values()].includes(key)) return null;
            return <TextRow key={t.key} item={t} resource={r} />;
          })}
        </fieldset>
      ))}
    </section>
  );
}
type TextsResource = ReturnType<typeof useResource<{ texts: AdminText[] }>>;
/** إخفاء نص من الموقع دون مسحه؛ يعود كما هو عند إلغاء الإخفاء. */
function HideToggle({
  item,
  resource: r,
  label,
}: {
  item: AdminText;
  resource: TextsResource;
  label: string;
}) {
  const [hidden, setHidden] = useState(item.hidden);
  useEffect(() => setHidden(item.hidden), [item.hidden]);
  return (
    <label className={s.hideToggle}>
      <input
        type="checkbox"
        checked={hidden}
        disabled={r.busy}
        aria-describedby={"text-" + item.key.replace(/\W/g, "-")}
        onChange={(e) => {
          setHidden(e.target.checked);
          r.write("PUT", { key: item.key, hidden: e.target.checked });
        }}
      />
      {label}
    </label>
  );
}
function TextRow({
  item,
  resource: r,
  toggle = true,
}: {
  item: AdminText;
  resource: TextsResource;
  /** خيار الإخفاء داخل السطر؛ في الفقرات يكون أعلى البطاقة. */
  toggle?: boolean;
}) {
  const label = siteTextLabels[item.key as SiteTextKey]?.[1] ?? item.key;
  const id = "text-" + item.key.replace(/\W/g, "-");
  const [draft, setDraft] = useState(item.value);
  useEffect(() => setDraft(item.value), [item.value]);
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
      {toggle && <HideToggle item={item} resource={r} label={hideLabel} />}
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

type AppLinksData = {
  androidPackage: string;
  androidFingerprints: string[];
  iosAppIds: string[];
};
/** ربط تطبيقي قوقل بلاي وآبل بالموقع: يُعبَّأ مرة بعد إنشاء التطبيق في المتجر. */
export function AppLinksAdmin() {
  const r = useResource<{ links: AppLinksData }>("/api/admin/app-links");
  const links = r.data?.links;
  const lines = (v: FormDataEntryValue | null) =>
    String(v ?? "")
      .split(/\s*[\n,]\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <section>
      <h2>تطبيق الجوال</h2>
      <p className={s.muted}>
        التطبيق يعرض الموقع نفسه، فكل تعديل ننشره يظهر فيه فورًا دون تحديث
        المتجر. هذه البيانات تُعبَّأ مرة واحدة بعد إنشاء التطبيق، وتُنشر في
        <bdi> /.well-known/assetlinks.json </bdi>و
        <bdi> /.well-known/apple-app-site-association</bdi>.
      </p>
      <Message error={r.error} success={r.success} />
      {!links && !r.error ? (
        <p role="status">جارٍ التحميل…</p>
      ) : links ? (
        <form
          key={JSON.stringify(links)}
          className={`${s.card} ${s.form}`}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            r.write("PUT", {
              androidPackage: String(f.get("androidPackage") ?? "").trim(),
              androidFingerprints: lines(f.get("androidFingerprints")),
              iosAppIds: lines(f.get("iosAppIds")),
            });
          }}
        >
          <div className={s.field}>
            <label htmlFor="app-android-package">
              اسم حزمة أندرويد (Package name)
            </label>
            <input
              id="app-android-package"
              name="androidPackage"
              dir="ltr"
              placeholder="com.jdatna.app"
              defaultValue={links.androidPackage}
            />
          </div>
          <div className={s.field}>
            <label htmlFor="app-android-fingerprints">
              بصمة شهادة التوقيع SHA-256 من Play Console (سطر لكل بصمة)
            </label>
            <textarea
              id="app-android-fingerprints"
              name="androidFingerprints"
              dir="ltr"
              rows={3}
              defaultValue={links.androidFingerprints.join("\n")}
            />
          </div>
          <div className={s.field}>
            <label htmlFor="app-ios-ids">
              معرّف تطبيق آبل TeamID.BundleID (سطر لكل معرّف)
            </label>
            <textarea
              id="app-ios-ids"
              name="iosAppIds"
              dir="ltr"
              rows={2}
              placeholder="ABCDE12345.com.jdatna.app"
              defaultValue={links.iosAppIds.join("\n")}
            />
          </div>
          <button className={s.button} disabled={r.busy}>
            {r.busy ? "جارٍ الحفظ…" : "حفظ بيانات التطبيق"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

type StoreReview = {
  until: string | null;
  client: boolean;
  family: boolean;
  familySlug: string;
  usernames: { client: string; family: string };
  phones: { client: string; family: string; signup: string };
  code: string;
};
/**
 * حسابات مراجعة المتاجر (Apple وGoogle): المالك يختار كلمة المرور هنا فلا تُحفظ في المستودع،
 * و«وضع المراجعة» يوقف رمز SMS لرقم إنشاء الحساب التجريبي فقط حتى تنتهي مدته.
 */
export function StoreReviewAdmin() {
  const r = useResource<StoreReview>("/api/admin/store-review");
  const d = r.data;
  const local = (p: string) => p.replace("+966", "0");
  return (
    <section>
      <h2>مراجعة المتاجر</h2>
      <p className={s.muted}>
        حسابان لمراجع Apple وGoogle يدخلان باسم المستخدم وكلمة المرور بلا رمز
        جوال: حساب عميل وحساب أسرة منتجة، ومعهما طبق وطلب ومحادثة تجريبية.
        الأسرة التجريبية لا تظهر في قوائم الموقع، ولا يتعامل معها إلا حساب
        مراجعة، وحساب المراجعة لا يطلب من أسرة حقيقية.
      </p>
      <Message error={r.error} success={r.success} />
      {!d && !r.error ? (
        <p role="status">جارٍ التحميل…</p>
      ) : d ? (
        <>
          <div className={s.card}>
            <p>
              حساب العميل: <bdi dir="ltr">{d.usernames.client}</bdi>{" "}
              {d.client ? "✅ جاهز" : "— لم يُنشأ بعد"}
            </p>
            <p>
              حساب الأسرة: <bdi dir="ltr">{d.usernames.family}</bdi>{" "}
              {d.family ? "✅ جاهز" : "— لم يُنشأ بعد"}
              {d.family && (
                <>
                  {" "}
                  (<a href={`/producers/${d.familySlug}`}>صفحة الأسرة</a>)
                </>
              )}
            </p>
            <p>
              وضع المراجعة:{" "}
              {d.until
                ? `مفتوح حتى ${new Date(d.until).toLocaleString("ar-SA")}`
                : "مغلق"}
            </p>
            <p className={s.muted}>
              أثناء وضع المراجعة فقط يُنشأ حساب جديد بالرقم{" "}
              <bdi dir="ltr">{local(d.phones.signup)}</bdi> والرمز{" "}
              <bdi dir="ltr">{d.code}</bdi> بلا رسالة (لعرض إنشاء الحساب ثم
              حذفه). باقي الأرقام يصلها رمز SMS كالمعتاد دائمًا.
            </p>
          </div>
          <form
            className={`${s.card} ${s.form}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const password = String(f.get("password") ?? "");
              if (password !== String(f.get("confirm") ?? "")) {
                r.setError("كلمتا المرور غير متطابقتين");
                return;
              }
              if (
                await r.write("PUT", {
                  ...(password ? { password } : {}),
                  days: Number(f.get("days")),
                })
              )
                form.reset();
            }}
          >
            <div className={s.field}>
              <label htmlFor="review-password">
                كلمة مرور الحسابين (ثمانية أحرف على الأقل؛ اتركها فارغة للإبقاء
                على الحالية)
              </label>
              <input
                id="review-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required={!d.client || !d.family}
              />
            </div>
            <div className={s.field}>
              <label htmlFor="review-confirm">تأكيد كلمة المرور</label>
              <input
                id="review-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <div className={s.field}>
              <label htmlFor="review-days">مدة وضع المراجعة</label>
              <select id="review-days" name="days" defaultValue="14">
                <option value="1">يوم واحد</option>
                <option value="7">سبعة أيام</option>
                <option value="14">أسبوعان (حتى تنتهي مراجعة المتجر)</option>
                <option value="30">شهر</option>
                <option value="0">إغلاق وضع المراجعة الآن</option>
              </select>
            </div>
            <button className={s.button} disabled={r.busy}>
              {r.busy ? "جارٍ التجهيز…" : "تجهيز الحسابين وحفظ المدة"}
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}

/** حقول نموذج «إضافة منتج» عند الأسر: إخفاء أو حذف أو إعادة كل حقل. */
export function ProductFieldsAdmin() {
  const r = useResource<{ fields: ProductFields }>("/api/admin/product-fields");
  const fields = r.data?.fields;
  const set = (key: string, state: ProductFieldState) =>
    r.write("PUT", { key, state });
  const shown = productFieldKeys.filter((k) => fields?.[k] !== "deleted");
  const deleted = productFieldKeys.filter((k) => fields?.[k] === "deleted");
  return (
    <section aria-labelledby="product-fields-title">
      <h2 id="product-fields-title">حقول إضافة المنتج</h2>
      <p className={s.muted}>
        الحقول التي تظهر للأسرة عند إضافة منتج. اسم المنتج والقسم أساسيان ولا
        يُخفيان. الحقل المخفي أو المحذوف لا يظهر في النموذج، وتبقى قيم المنتجات
        السابقة كما هي.
      </p>
      <Message error={r.error} success={r.success} />
      {!fields && !r.error && <p role="status">جارٍ التحميل…</p>}
      {fields && (
        <div className={s.productRows}>
          {shown.map((k) => (
            <div className={s.productRow} key={k}>
              <span className={s.productInfo}>
                {productFieldLabels[k]}
                {fields[k] === "hidden" && (
                  <em className={s.hiddenTag}> · مخفي</em>
                )}
              </span>
              <div className={s.productActions}>
                <button
                  type="button"
                  disabled={r.busy}
                  onClick={() =>
                    set(k, fields[k] === "hidden" ? "shown" : "hidden")
                  }
                  aria-label={`${fields[k] === "hidden" ? "إظهار" : "إخفاء"} حقل ${productFieldLabels[k]}`}
                >
                  {fields[k] === "hidden" ? "إظهار" : "إخفاء"}
                </button>
                <button
                  type="button"
                  className={s.deleteAction}
                  disabled={r.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `حذف حقل «${productFieldLabels[k]}» من نموذج إضافة المنتج؟ يمكنك استعادته لاحقًا.`,
                      )
                    )
                      set(k, "deleted");
                  }}
                  aria-label={`حذف حقل ${productFieldLabels[k]}`}
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
          {deleted.length > 0 && (
            <>
              <h3>حقول محذوفة</h3>
              {deleted.map((k) => (
                <div className={s.productRow} key={k}>
                  <span className={s.productInfo}>
                    <s>{productFieldLabels[k]}</s>
                  </span>
                  <div className={s.productActions}>
                    <button
                      type="button"
                      disabled={r.busy}
                      onClick={() => set(k, "shown")}
                      aria-label={`استعادة حقل ${productFieldLabels[k]}`}
                    >
                      استعادة
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
