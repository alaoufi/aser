import { categoryLabel } from "@/lib/category-label";
import { LocationFields } from "@/components/public/location-fields";
import type { Metadata } from "next";
import Link from "next/link";
import {
  browseLists,
  getCategories,
  getCities,
  getProducer,
  normalizeArabic,
  searchProducers,
  searchProducts,
  searchWords,
} from "@/server/catalog";
import { EmptyState, ProducerCard, ProductCard } from "@/components/public/ui";
// عنوان التبويب يتبع القسم أو الأسرة المنتجة المفتوحة.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const category = typeof raw.category === "string" ? raw.category : "";
  const producer = typeof raw.producer === "string" ? raw.producer : "";
  if (category) {
    const found = (await getCategories()).find((c) => c.id === category);
    if (found) return { title: found.name };
  }
  if (producer) {
    const found = await getProducer(producer);
    if (found) return { title: `منتجات ${found.name}` };
  }
  return { title: "طبخات اليوم" };
}
export const dynamic = "force-dynamic";

// أربع طرق للبحث: بالكلمة، المتاح الآن، منتجات أسرة، منتجات قسم.
const modes = [
  ["word", "بالكلمة"],
  ["available", "المتاح الآن"],
  ["family", "حسب الأسرة المنتجة"],
  ["category", "حسب القسم"],
] as const;
type Mode = (typeof modes)[number][0];

export default async function Browse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const val = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";
  const legacy = val("in") === "families" ? "family" : "";
  const by: Mode = modes.some(([key]) => key === val("by"))
    ? (val("by") as Mode)
    : (legacy as Mode) ||
      (val("producer") ? "family" : val("category") ? "category" : "word");
  const statusParam = val("status") || (by === "available" ? "available" : "");
  const filters = {
    q: val("q").trim(),
    city: val("city"),
    region: val("region"),
    category: val("category"),
    status: statusParam === "all" ? "" : statusParam,
    include: statusParam === "all" ? "all" : "",
    delivery: val("delivery"),
    producer: val("producer"),
  };
  const showFamilyDirectory = by === "family" && !filters.producer;
  const showCategoryDirectory = by === "category" && !filters.category;
  const listProducts = !showFamilyDirectory && !showCategoryDirectory;
  const [categories, cities, lists, products, families, family] =
    await Promise.all([
      getCategories(),
      getCities(),
      browseLists({ region: filters.region, city: filters.city }),
      listProducts ? searchProducts(filters) : Promise.resolve([]),
      by === "word" && filters.q && !filters.producer
        ? searchProducers({
            q: filters.q,
            city: filters.city,
            region: filters.region,
            category: filters.category,
            delivery: filters.delivery,
          })
        : Promise.resolve([]),
      filters.producer ? getProducer(filters.producer) : Promise.resolve(null),
    ]);
  // توسيع الدائرة: لا نتائج بكل الكلمات ← يكفي تطابق أي كلمة، ويشمل غير المتوفر.
  const widened =
    listProducts && filters.q && !products.length
      ? await searchProducts({ ...filters, match: "any", include: "all" })
      : [];
  // أقسام تطابق كلمة البحث، كاقتراحات سريعة.
  const words = searchWords(filters.q);
  const matchedCategories = words.length
    ? categories
        .filter((c) => words.some((w) => normalizeArabic(c.name).includes(w)))
        .slice(0, 6)
    : [];
  const countOf = (id: string): number =>
    (lists.categoryCounts[id] ?? 0) +
    categories
      .filter((c) => c.parentId === id)
      .reduce((sum, c) => sum + countOf(c.id), 0);
  const topCategories = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => Number(countOf(b.id) > 0) - Number(countOf(a.id) > 0));
  const currentCategory = categories.find((c) => c.id === filters.category);
  const branches = categories.filter((c) => c.parentId === filters.category);
  const parentCategory = categories.find(
    (c) => c.id === currentCategory?.parentId,
  );
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams(
      Object.entries({
        by,
        q: filters.q,
        region: filters.region,
        city: filters.city,
        category: filters.category,
        producer: filters.producer,
        delivery: filters.delivery,
        status: val("status"),
        ...patch,
      }).filter(([key, value]) => value && !(key === "by" && value === "word")),
    );
    const query = params.toString();
    return query ? `/browse?${query}` : "/browse";
  };
  const familiesWithProducts = lists.families.filter((f) => f.available > 0);
  // عند فتح قسم أو أسرة تصبح الصفحة كلها لهما: العنوان والوصف والفروع والنتائج.
  const focus: "category" | "family" | null = currentCategory
    ? "category"
    : family
      ? "family"
      : null;
  const available = currentCategory ? countOf(currentCategory.id) : 0;
  return (
    <div className="wrap page-space">
      {focus === "category" && currentCategory ? (
        <div className="page-intro section-intro">
          <p className="eyebrow">
            {parentCategory
              ? categoryLabel(parentCategory, categories)
              : "قسم من أقسام جدتنا"}
          </p>
          <h1>{currentCategory.name}</h1>
          <p>
            {available
              ? `${available} من المنتجات المتاحة من الأسر في هذا القسم${branches.length ? " وفروعه" : ""}.`
              : "لا توجد منتجات متاحة في هذا القسم حاليًا."}
          </p>
          <div className="section-intro-links">
            {parentCategory && (
              <Link
                className="text-link"
                href={href({ category: parentCategory.id })}
              >
                → {parentCategory.name}
              </Link>
            )}
            <Link
              className="text-link"
              href={href({ by: "category", category: "", q: "" })}
            >
              كل الأقسام
            </Link>
          </div>
        </div>
      ) : focus === "family" && family ? (
        <div className="page-intro section-intro">
          <p className="eyebrow">أسرة منتجة · {family.cityName}</p>
          <h1>{family.name}</h1>
          <p>
            {filters.include
              ? "كل منتجات الأسرة المنتجة."
              : "منتجات الأسرة المنتجة المتاحة الآن وحسب الطلب."}
          </p>
          <div className="section-intro-links">
            <Link className="text-link" href={`/producers/${family.slug}`}>
              صفحة الأسرة المنتجة والتواصل
            </Link>
            <Link
              className="text-link"
              href={href({ by: "family", producer: "", q: "" })}
            >
              كل الأسر
            </Link>
          </div>
        </div>
      ) : (
        <div className="page-intro">
          <h1>طبخات اليوم</h1>
          <p>اختر طريقة البحث، ونعرض لك المتاح أولًا.</p>
        </div>
      )}
      {!focus && (
        <nav className="search-modes" aria-label="طريقة البحث">
          {modes.map(([key, label]) => (
            <Link
              key={key}
              href={href({
                by: key,
                ...(key === "family" ? { category: "" } : {}),
                ...(key === "category" ? { producer: "" } : {}),
                ...(key === "available" ? { status: "" } : {}),
              })}
              aria-current={by === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {currentCategory && (branches.length > 0 || parentCategory) && (
        <nav aria-label="فروع القسم" className="category-branches">
          <div>
            {parentCategory && (
              <Link href={href({ category: parentCategory.id })}>
                العودة إلى {parentCategory.name}
              </Link>
            )}
            {branches.map((c) => (
              <Link key={c.id} href={href({ category: c.id })}>
                {c.name}
                {countOf(c.id) > 0 ? ` (${countOf(c.id)})` : ""}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <details className="filter-wrap" open={by === "word" && !focus}>
        <summary>
          {focus === "category"
            ? "ابحث داخل القسم: الكلمة، المنطقة، الأسرة المنتجة"
            : focus === "family"
              ? "ابحث داخل منتجات الأسرة المنتجة: الكلمة، القسم"
              : "ابحث: الكلمة، المنطقة، الأسرة المنتجة، القسم"}
        </summary>
        <form className="filter-bar" action="/browse" autoComplete="off">
          {by !== "word" && <input type="hidden" name="by" value={by} />}
          <label className="search-query">
            وش تطلب اليوم
            <input
              type="search"
              autoComplete="off"
              name="q"
              defaultValue={filters.q}
              placeholder={
                by === "word"
                  ? "جريش، مرقوق، اسم الأسرة المنتجة، قهوة…"
                  : "ابحث داخل القائمة (اختياري)"
              }
            />
          </label>
          <LocationFields
            key={`${filters.region}:${filters.city}`}
            cities={cities}
            defaultRegion={filters.region}
            defaultCity={filters.city}
          />
          <label>
            <span className="sr-only">الأسرة المنتجة</span>
            <select name="producer" defaultValue={filters.producer}>
              <option value="">كل الأسر</option>
              {lists.families.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.name} ({f.available} متاح)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">التصنيف</span>
            <select name="category" defaultValue={filters.category}>
              <option value="">كل التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c, categories)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">التوفر</span>
            <select name="status" defaultValue={val("status")}>
              <option value="">
                {by === "available" ? "متوفر الآن" : "المتاح والطلب المسبق"}
              </option>
              {by !== "available" && (
                <option value="available">متوفر الآن</option>
              )}
              <option value="preorder">حسب الطلب</option>
              <option value="all">يشمل غير المتوفر</option>
            </select>
          </label>
          <label>
            <span className="sr-only">طريقة الاستلام</span>
            <select name="delivery" defaultValue={filters.delivery}>
              <option value="">كل طرق الاستلام</option>
              <option value="true">توصيل متاح</option>
              <option value="pickup">استلام شخصي</option>
            </select>
          </label>
          <button className="button" type="submit">
            بحث
          </button>
        </form>
      </details>

      {!focus && matchedCategories.length > 0 && (
        <nav className="search-suggestions" aria-label="أقسام مقترحة">
          <span>أقسام مطابقة:</span>
          {matchedCategories.map((c) => (
            <Link
              key={c.id}
              href={href({ by: "category", category: c.id, q: "" })}
            >
              {categoryLabel(c, categories)}
            </Link>
          ))}
        </nav>
      )}

      {filters.producer && focus !== "family" && (
        <div className="family-filter" role="status">
          <p>
            {family ? (
              <>
                منتجات <strong>{family.name}</strong>
                {filters.include ? "" : " المتاحة"}
              </>
            ) : (
              "الأسرة المنتجة غير موجودة أو غير منشورة"
            )}
          </p>
          <div>
            {family && (
              <Link className="text-link" href={`/producers/${family.slug}`}>
                صفحة الأسرة المنتجة ←
              </Link>
            )}
            <Link className="text-link" href={href({ producer: "" })}>
              كل الأسر ×
            </Link>
          </div>
        </div>
      )}

      {showFamilyDirectory && (
        <section aria-label="الأسر">
          <div className="results-heading">
            <h2>{familiesWithProducts.length} أسرة لديها منتجات متاحة</h2>
          </div>
          {lists.families.length ? (
            <ul className="directory-list">
              {lists.families.map((f) => (
                <li key={f.slug}>
                  <Link
                    href={href({ producer: f.slug })}
                    className={f.available ? undefined : "is-empty"}
                  >
                    <strong>{f.name}</strong>
                    <span>{f.cityName}</span>
                    <em>
                      {f.available
                        ? `${f.available} منتج متاح`
                        : "لا يوجد متاح"}
                    </em>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="لا توجد أسر في هذا النطاق بعد"
              text="جرّب منطقة أو مدينة أخرى."
            />
          )}
        </section>
      )}

      {showCategoryDirectory && (
        <section aria-label="الأقسام">
          <div className="results-heading">
            <h2>الأقسام</h2>
          </div>
          <ul className="directory-list">
            {topCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={href({ category: c.id })}
                  className={countOf(c.id) ? undefined : "is-empty"}
                >
                  <strong>{c.name}</strong>
                  <span>
                    {categories
                      .filter((child) => child.parentId === c.id)
                      .map((child) => child.name)
                      .join(" · ")}
                  </span>
                  <em>
                    {countOf(c.id) ? `${countOf(c.id)} متاح` : "لا يوجد متاح"}
                  </em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {families.length > 0 && (
        <section className="search-families" aria-label="أسر مطابقة">
          <div className="results-heading">
            <h2>أسر مطابقة ({families.length})</h2>
          </div>
          <div className="producer-grid">
            {families.slice(0, 4).map((p) => (
              <div key={p.id} className="search-family">
                <ProducerCard producer={p} />
                <Link
                  className="text-link"
                  href={href({ by: "family", producer: p.slug, q: "" })}
                >
                  منتجاتها المتاحة ←
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {listProducts && (
        <>
          <div className="results-heading">
            <h2>
              {products.length
                ? `${products.length} ${filters.include ? "منتج مطابق" : "منتج متاح"}${focus === "category" && currentCategory ? ` في ${currentCategory.name}` : ""}`
                : widened.length
                  ? "لا تطابق تام — نتائج قريبة"
                  : "نتائج المنتجات"}
            </h2>
            <Link
              href={
                focus === "category" && currentCategory
                  ? `/browse?category=${encodeURIComponent(currentCategory.id)}`
                  : focus === "family" && family
                    ? `/browse?producer=${encodeURIComponent(family.slug)}`
                    : "/browse"
              }
              className="text-link"
            >
              مسح المرشحات
            </Link>
          </div>
          {products.length || widened.length ? (
            <div className="product-grid">
              {(products.length ? products : widened).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="لم نجد منتجات بهذه الخيارات"
              text="جرّب «حسب القسم» أو «حسب الأسرة المنتجة»، أو كلمة أقصر، أو امسح المرشحات. تظهر المنتجات المعتمدة والمنشورة فقط."
            />
          )}
        </>
      )}
    </div>
  );
}
