"use client";
import { categoryLabel } from "@/lib/category-label";
import { useEffect, useState } from "react";
import type { Product, Category } from "@/lib/types";
import { ProductPhoto } from "./product-photo";
import { LibraryPicker, type LibraryPhoto } from "./library";
import { DeliveryScopeFields, readDeliveryScope } from "./delivery-scope";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
const statusLabels = {
  available: "متوفر",
  unavailable: "غير متوفر",
  preorder: "حسب الطلب",
};
export function Products() {
  const session = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [familyScope, setFamilyScope] = useState<{
    deliveryScope: "coverage" | "kingdom";
    shippingFee: number | null;
  }>({ deliveryScope: "coverage", shippingFee: null });
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [contactPrice, setContactPrice] = useState(false);
  const [libraryPhoto, setLibraryPhoto] = useState("");
  async function load() {
    const [p, c] = await Promise.all([
      api<{ products: Product[] }>("/api/producer/products"),
      api<{
        categories: Category[];
        profile: {
          categoryIds?: string[];
          deliveryScope?: "coverage" | "kingdom";
          shippingFee?: number | null;
        } | null;
      }>("/api/producer/profile"),
    ]);
    setProducts(p.products);
    setCategories(c.categories);
    setMine(c.profile?.categoryIds ?? []);
    setFamilyScope({
      deliveryScope: c.profile?.deliveryScope ?? "coverage",
      shippingFee: c.profile?.shippingFee ?? null,
    });
  }
  useEffect(() => {
    if (session.user?.role === "producer" || session.user?.role === "admin")
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user]);
  function edit(p: Product | null) {
    setEditing(p);
    setLibraryPhoto("");
    setContactPrice(p?.price === null);
    setSuccess("");
    setError("");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const f = new FormData(e.currentTarget);
    const categoryIds = f.getAll("categoryIds").map(String);
    if (!categoryIds.length) {
      setError("اختر تصنيفًا للمنتج.");
      return;
    }
    const price = contactPrice ? null : Number(f.get("price"));
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setError("أدخل سعرًا صحيحًا.");
      return;
    }
    const payload: Record<string, unknown> = {
      id: editing?.id,
      name: f.get("name"),
      description: f.get("description"),
      price,
      unit: f.get("unit"),
      status: f.get("status"),
      categoryIds,
      ...(libraryPhoto ? { libraryPhotoId: libraryPhoto } : {}),
      ...readDeliveryScope(f),
      allergens: String(f.get("allergens") || "")
        .split("،")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    for (const k of [
      "ingredients",
      "storage",
      "shelfLife",
      "preparationTime",
      "story",
    ])
      payload[k] = f.get(k) || null;
    setBusy(true);
    try {
      await api("/api/producer/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await load();
      setEditing(undefined);
      setSuccess("تم حفظ المنتج.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <h1>منتجات صنعتها بحب</h1>
      <Guard {...session} />
      {session.ready && session.user && session.user.role === "customer" && (
        <p className={s.notice}>
          إدارة المنتجات متاحة لحساب الأسرة المنتجة بعد مراجعة أهليتها.{" "}
          <a href="/register">أكمل تسجيل أسرتك</a>.
        </p>
      )}
      {session.user && session.user.role !== "customer" && (
        <>
          <p className={s.muted}>
            أضف منتجاتك ومعلوماتها بوضوح، وساعد الزوار على اختيار ما يناسبهم.
          </p>
          <Message error={error} success={success} />
          <button className={s.button} onClick={() => edit(null)}>
            + إضافة منتج
          </button>
          {editing !== undefined && (
            <form
              className={`${s.card} ${s.form}`}
              key={editing?.id || "new"}
              onSubmit={save}
              data-product-form
            >
              <h2>{editing ? "تعديل المنتج" : "منتج جديد"}</h2>
              <LibraryPicker
                value={libraryPhoto}
                onPick={(photo: LibraryPhoto | null) => {
                  setLibraryPhoto(photo?.id ?? "");
                  if (!photo) return;
                  // اختيار طبق من المكتبة يملأ الاسم والوصف والقسم إن كانت فارغة.
                  const form = document.querySelector<HTMLFormElement>(
                    `form[data-product-form]`,
                  );
                  const fill = (name: string, value: string) => {
                    const el = form?.querySelector<
                      HTMLInputElement | HTMLTextAreaElement
                    >(`[name="${name}"]`);
                    if (el && !el.value.trim() && value) el.value = value;
                  };
                  fill("name", photo.name);
                  fill("description", photo.description);
                  if (photo.categoryId) {
                    const boxes = form?.querySelectorAll<HTMLInputElement>(
                      'input[name="categoryIds"]',
                    );
                    if (boxes && ![...boxes].some((b) => b.checked))
                      for (const b of boxes)
                        if (b.value === photo.categoryId) b.checked = true;
                  }
                }}
              />
              <div className={s.grid}>
                <label className={s.field}>
                  اسم المنتج
                  <input
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={editing?.name}
                  />
                </label>
                <label className={s.field}>
                  وحدة البيع
                  <input
                    name="unit"
                    required
                    defaultValue={editing?.unit || "طبق"}
                    maxLength={60}
                  />
                </label>
                <label className={s.field}>
                  <span className="sr-only">التوفر</span>
                  <select
                    name="status"
                    defaultValue={editing?.status || "available"}
                  >
                    <option value="" disabled>
                      اختر حالة التوفر
                    </option>
                    {Object.entries(statusLabels).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  السعر بالريال
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required={!contactPrice}
                    disabled={contactPrice}
                    defaultValue={editing?.price ?? ""}
                  />
                </label>
              </div>
              <label className={s.checks}>
                <input
                  type="checkbox"
                  checked={contactPrice}
                  onChange={(e) => setContactPrice(e.target.checked)}
                />
                السعر عند التواصل
              </label>
              <label className={s.field}>
                تفاصيل المنتج
                <textarea
                  name="description"
                  required
                  maxLength={4000}
                  defaultValue={editing?.description}
                />
              </label>
              {/* يُعرض في كل إضافة: افتراضي الأسرة، أو قيمة المنتج عند التعديل. */}
              <DeliveryScopeFields
                legend="نطاق توصيل هذا المنتج"
                defaultScope={
                  editing?.deliveryScope ?? familyScope.deliveryScope
                }
                defaultFee={
                  editing
                    ? (editing.shippingFee ?? null)
                    : familyScope.shippingFee
                }
              />
              <fieldset>
                <legend>القسم (من أقسامك)</legend>
                {mine.length === 0 && (
                  <p className={s.notice}>
                    اختر أقسام منتجاتك أولًا من صفحة بيانات الأسرة.
                  </p>
                )}
                <div className={s.checks}>
                  {categories
                    .filter((c) => mine.includes(c.id))
                    .map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          name="categoryIds"
                          value={c.id}
                          defaultChecked={editing?.categoryIds.includes(c.id)}
                        />
                        {categoryLabel(c, categories)}
                      </label>
                    ))}
                </div>
              </fieldset>
              <label className={s.field}>
                مسببات الحساسية · افصل بفاصلة عربية (،)
                <input
                  name="allergens"
                  defaultValue={editing?.allergens.join("، ")}
                  placeholder="الحليب، المكسرات، القمح"
                />
              </label>
              <div className={s.grid}>
                {(
                  [
                    ["ingredients", "المكونات"],
                    ["storage", "شروط الحفظ والتبريد"],
                    ["shelfLife", "مدة الصلاحية"],
                    ["preparationTime", "وقت التجهيز"],
                  ] as const
                ).map(([key, label]) => (
                  <label className={s.field} key={key}>
                    {label}
                    <input
                      name={key}
                      defaultValue={editing?.[key] || ""}
                      maxLength={1000}
                    />
                  </label>
                ))}
              </div>
              <label className={s.field}>
                قصة الأكلة (اختياري)
                <textarea
                  name="story"
                  defaultValue={editing?.story || ""}
                  maxLength={3000}
                />
              </label>
              <p className={s.muted}>
                احفظ المنتج أولًا، ثم أضف صورته من بطاقته أدناه. تأكد من الإفصاح
                عن معلومات السلامة والحساسية اللازمة لمنتجك.
              </p>
              <div className={s.actions}>
                <button className={s.button} disabled={busy}>
                  {busy ? "جارٍ الحفظ…" : "حفظ المنتج"}
                </button>
                <button
                  className={s.button}
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}
          {!loaded ? (
            <p role="status">جارٍ تحميل المنتجات…</p>
          ) : !products.length ? (
            <p className={s.notice}>
              لم تضف منتجات بعد. ابدأ بأول أكلة من صنع أسرتك.
            </p>
          ) : (
            <div className={s.list}>
              {products.map((p) => (
                <article key={p.id} className={s.card}>
                  <span className={s.tag}>{statusLabels[p.status]}</span>
                  <h2>{p.name}</h2>
                  <p>{p.description}</p>
                  <p>
                    {p.price === null
                      ? "السعر عند التواصل"
                      : `${p.price} ر.س / ${p.unit}`}
                  </p>
                  <button className={s.button} onClick={() => edit(p)}>
                    تعديل {p.name}
                  </button>
                  <ProductPhoto
                    id={p.id}
                    imageUrl={p.imageUrl}
                    onUploaded={load}
                  />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </AccountShell>
  );
}
