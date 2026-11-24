"use client";
import { categoryLabel } from "@/lib/category-label";
import { useEffect, useState } from "react";
import { enterNext } from "./enter-next";
import type { Product, Category } from "@/lib/types";
import { ProductPhoto } from "./product-photo";
import { LibraryPicker, type LibraryPhoto } from "./library";
import { DeliveryScopeFields, readDeliveryScope } from "./delivery-scope";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import {
  fieldShown,
  type ProductFieldKey,
  type ProductFields,
} from "@/lib/product-fields";
/** حقل أخفته الإدارة: لا يظهر، وتبقى قيمته السابقة كما هي عند الحفظ. */
function Keep({ name, value }: { name: string; value: unknown }) {
  return <input type="hidden" name={name} value={String(value ?? "")} />;
}
import { productStatusLabels } from "@/lib/site-texts";
import { ShareAction } from "./share-action";
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
  const [fields, setFields] = useState<ProductFields | null>(null);
  // أسماء حالة المنتج من «نصوص الموقع» (جاهز، غير جاهز، حسب الطلب).
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>(
    productStatusLabels(),
  );
  const show = (k: ProductFieldKey) => fieldShown(fields, k);
  async function load() {
    const [p, c] = await Promise.all([
      api<{
        products: Product[];
        fields?: ProductFields;
        statusLabels?: Record<string, string>;
      }>("/api/producer/products"),
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
    if (p.statusLabels) setStatusLabels(p.statusLabels);
    setFields(p.fields ?? null);
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
  // المنتجات مجمّعة في أقسام الأسرة: يُفتح القسم فتظهر منتجاته وأمام كل منتج أزراره.
  const groups = [
    ...categories
      .filter(
        (c) =>
          mine.includes(c.id) ||
          products.some((p) => p.categoryIds?.includes(c.id)),
      )
      .map((c) => ({
        id: c.id,
        label: categoryLabel(c, categories),
        items: products.filter((p) => p.categoryIds?.includes(c.id)),
      })),
    {
      id: "",
      label: "بدون قسم",
      items: products.filter(
        (p) =>
          !p.categoryIds?.some((id) => categories.some((c) => c.id === id)),
      ),
    },
  ].filter((g) => g.items.length);
  async function manage(p: Product, action: "hide" | "show" | "delete") {
    if (
      action === "delete" &&
      !window.confirm(
        `حذف «${p.name}» نهائيًا؟ يختفي من صفحتك ومن الموقع، وتبقى طلباته السابقة في السجل.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/producer/products", {
        method: "PUT",
        body: JSON.stringify({ id: p.id, action }),
      });
      await load();
      setSuccess(
        action === "delete"
          ? `حُذف «${p.name}».`
          : action === "hide"
            ? `أُخفي «${p.name}» عن الزوار.`
            : `ظهر «${p.name}» للزوار.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(p: Product | null) {
    setEditing(p);
    setLibraryPhoto("");
    setContactPrice(p?.price === null);
    setSuccess("");
    setError("");
  }
  // زر (+) في القائمة السفلية يفتح «منتج جديد» مباشرة (?new=1).
  // biome-ignore lint/correctness/useExhaustiveDependencies: مرة واحدة عند الفتح.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    edit(null);
    window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() =>
      document
        .querySelector("form[data-product-form]")
        ?.scrollIntoView({ block: "start" }),
    );
  }, []);
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
    const price = !show("price")
      ? (editing?.price ?? null)
      : contactPrice
        ? null
        : Number(f.get("price"));
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
      // المصطلح واحد (قرار المالك 2026-11-23): «إضافة المنتج» ← «تمت إضافة المنتج»، و«حفظ التعديلات» ← «تم حفظ التعديلات».
      const done = editing ? "تم حفظ تعديلات المنتج" : "تمت إضافة المنتج";
      await api("/api/producer/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
        saved: done,
      });
      await load();
      setEditing(undefined);
      setSuccess(`${done} ✓`);
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
          <button
            type="button"
            className={s.addProduct}
            onClick={() => edit(null)}
          >
            <span aria-hidden="true">＋</span> إضافة منتج
          </button>
          {editing !== undefined && (
            <form
              className={`${s.card} ${s.form} compact-form`}
              key={editing?.id || "new"}
              onSubmit={save}
              onKeyDown={enterNext}
              data-product-form
            >
              <h2>{editing ? "تعديل المنتج" : "منتج جديد"}</h2>
              {show("library") && (
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
              )}
              {/* الأساسي أولًا بترتيب ما تفكر فيه الأسرة: الاسم، القسم، السعر، ثم التفاصيل والتوصيل (طلب المالك 2026-11-24). */}
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
              </div>
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
              <div className={s.grid}>
                {show("price") && (
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
                )}
                {show("unit") ? (
                  <label className={s.field}>
                    وحدة البيع
                    <input
                      name="unit"
                      required
                      defaultValue={editing?.unit || "طبق"}
                      maxLength={60}
                    />
                  </label>
                ) : (
                  <Keep name="unit" value={editing?.unit || "طبق"} />
                )}
              </div>
              <label className={s.checks} hidden={!show("price")}>
                <input
                  type="checkbox"
                  checked={contactPrice}
                  onChange={(e) => setContactPrice(e.target.checked)}
                />
                السعر عند التواصل
              </label>
              {/* حالتا «جاهز / حسب الطلب» أُلغيتا من النموذج (طلب المالك 2026-11-24): المنتج المنشور متوفر، والإخفاء بزر «إخفاء». */}
              <Keep name="status" value="available" />
              {show("description") ? (
                <label className={s.field}>
                  تفاصيل المنتج
                  <textarea
                    name="description"
                    required
                    maxLength={4000}
                    defaultValue={editing?.description}
                  />
                </label>
              ) : (
                <Keep name="description" value={editing?.description} />
              )}
              {/* يُعرض في كل إضافة: افتراضي الأسرة، أو قيمة المنتج عند التعديل. */}
              {show("deliveryScope") ? (
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
              ) : (
                <>
                  <Keep
                    name="deliveryScope"
                    value={editing?.deliveryScope ?? familyScope.deliveryScope}
                  />
                  <Keep
                    name="shippingFee"
                    value={
                      editing
                        ? (editing.shippingFee ?? "")
                        : (familyScope.shippingFee ?? "")
                    }
                  />
                </>
              )}
              {/* غير الأساسي مطويّ، فالنموذج قصير؛ يُفتح تلقائيًا إن كان في المنتج شيء منه. */}
              <details
                className="form-more"
                hidden={
                  !(
                    show("allergens") ||
                    show("ingredients") ||
                    show("storage") ||
                    show("shelfLife") ||
                    show("preparationTime") ||
                    show("story")
                  )
                }
                open={Boolean(
                  editing &&
                  (editing.allergens.length ||
                    editing.ingredients ||
                    editing.storage ||
                    editing.shelfLife ||
                    editing.preparationTime ||
                    editing.story),
                )}
              >
                <summary>تفاصيل إضافية (اختياري)</summary>
                <div className={s.form}>
                  {show("allergens") ? (
                    <label className={s.field}>
                      مسببات الحساسية · افصل بفاصلة عربية (،)
                      <input
                        name="allergens"
                        defaultValue={editing?.allergens.join("، ")}
                        placeholder="الحليب، المكسرات، القمح"
                      />
                    </label>
                  ) : (
                    <Keep
                      name="allergens"
                      value={editing?.allergens.join("، ")}
                    />
                  )}
                  <div className={s.grid}>
                    {(
                      [
                        ["ingredients", "المكونات"],
                        ["storage", "شروط الحفظ والتبريد"],
                        ["shelfLife", "مدة الصلاحية"],
                        ["preparationTime", "وقت التجهيز"],
                      ] as const
                    ).map(([key, label]) =>
                      !show(key) ? (
                        <Keep key={key} name={key} value={editing?.[key]} />
                      ) : (
                        <label className={s.field} key={key}>
                          {label}
                          <input
                            name={key}
                            defaultValue={editing?.[key] || ""}
                            maxLength={1000}
                          />
                        </label>
                      ),
                    )}
                  </div>
                  {show("story") ? (
                    <label className={s.field}>
                      قصة الأكلة (اختياري)
                      <textarea
                        name="story"
                        defaultValue={editing?.story || ""}
                        maxLength={3000}
                      />
                    </label>
                  ) : (
                    <Keep name="story" value={editing?.story} />
                  )}
                </div>
              </details>
              <p className={s.muted}>
                {editing ? "احفظ التعديلات" : "أضف المنتج أولًا"}، ثم أضف صورته
                من بطاقته أدناه. تأكد من الإفصاح عن معلومات السلامة والحساسية
                اللازمة لمنتجك.
              </p>
              <div className={s.actions}>
                <button className={s.button} disabled={busy}>
                  {busy
                    ? editing
                      ? "جارٍ الحفظ…"
                      : "جارٍ الإضافة…"
                    : editing
                      ? "حفظ التعديلات"
                      : "إضافة المنتج"}
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
          {editing && (
            <div className={s.card}>
              <h3>صورة «{editing.name}»</h3>
              <ProductPhoto
                id={editing.id}
                imageUrl={editing.imageUrl}
                onUploaded={load}
              />
            </div>
          )}
          {!loaded ? (
            <p role="status">جارٍ تحميل المنتجات…</p>
          ) : !products.length ? (
            <p className={s.notice}>
              لم تضف منتجات بعد. ابدأ بأول أكلة من صنع أسرتك.
            </p>
          ) : (
            <div className={s.productGroups}>
              <p className={s.shareAll}>
                <ShareAction
                  query={`family=${encodeURIComponent(products[0].producerSlug)}`}
                  title={products[0].producerName}
                  text={`منتجات ${products[0].producerName} في أكلات جدتنا — أكل بيت`}
                  label="مشاركة كل منتجات الأسرة"
                  buttonText="مشاركة كل منتجاتي ↗"
                  className={s.button}
                />{" "}
                <span className={s.muted}>
                  رابط مختصر لصفحة أسرتك بكل منتجاتها، لواتساب وتيك توك.
                </span>
              </p>
              {groups.map((g, i) => (
                <details
                  key={g.id || "none"}
                  className={s.productGroup}
                  open={i === 0}
                >
                  <summary>
                    <span>{g.label}</span>
                    <small>{g.items.length} منتج</small>
                  </summary>
                  <ul className={s.productRows}>
                    {g.items.map((p) => (
                      <li key={p.id} className={s.productRow}>
                        <div className={s.productInfo}>
                          <strong>{p.name}</strong>
                          <small>
                            {statusLabels[p.status]} ·{" "}
                            {p.price === null
                              ? "السعر عند التواصل"
                              : `${p.price} ر.س / ${p.unit}`}
                            {p.visible === false && (
                              <em className={s.hiddenTag}>
                                {p.hiddenBy === "admin"
                                  ? " · أخفته الإدارة"
                                  : " · مخفي عن الزوار"}
                              </em>
                            )}
                          </small>
                        </div>
                        <div className={s.productActions}>
                          <button
                            type="button"
                            onClick={() => edit(p)}
                            aria-label={`تعديل ${p.name}`}
                          >
                            تعديل
                          </button>
                          {p.hiddenBy !== "admin" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                manage(p, p.visible === false ? "show" : "hide")
                              }
                              aria-label={`${p.visible === false ? "إظهار" : "إخفاء"} ${p.name}`}
                            >
                              {p.visible === false ? "إظهار" : "إخفاء"}
                            </button>
                          )}
                          {p.visible !== false && (
                            <ShareAction
                              query={`product=${encodeURIComponent(p.id)}`}
                              title={p.name}
                              text={`${p.name} من ${p.producerName}${p.price !== null ? ` — ${p.price} ر.س` : ""} في أكلات جدتنا`}
                              label={`مشاركة ${p.name}`}
                            />
                          )}
                          <button
                            type="button"
                            className={s.deleteAction}
                            disabled={busy}
                            onClick={() => manage(p, "delete")}
                            aria-label={`حذف ${p.name}`}
                          >
                            حذف
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </AccountShell>
  );
}
