import { categoryLabel } from "@/lib/category-label";
import { LocationFields } from "@/components/public/location-fields";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getCategories,
  getCities,
  getProducer,
  searchProducers,
  searchProducts,
} from "@/server/catalog";
import { EmptyState, ProducerCard, ProductCard } from "@/components/public/ui";
export const metadata: Metadata = { title: "اكتشف الأكلات" };
export const dynamic = "force-dynamic";
const scopes = [
  ["all", "الكل"],
  ["products", "الأكلات والمنتجات"],
  ["families", "الأسر"],
] as const;
export default async function Browse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const val = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";
  const scope = scopes.some(([key]) => key === val("in")) ? val("in") : "all";
  const statusParam = val("status");
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
  const wantFamilies =
    scope === "families" || (scope === "all" && Boolean(filters.q));
  const [categories, cities, products, families, family] = await Promise.all([
    getCategories(),
    getCities(),
    scope === "families" ? Promise.resolve([]) : searchProducts(filters),
    wantFamilies && !filters.producer
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
  const currentCategory = categories.find((c) => c.id === filters.category);
  const branches = categories.filter((c) => c.parentId === filters.category);
  const parentCategory = categories.find(
    (c) => c.id === currentCategory?.parentId,
  );
  const query = (patch: Record<string, string>) => {
    const params = new URLSearchParams(
      Object.entries({ ...filters, status: statusParam, in: scope, ...patch })
        .filter(([key, value]) => value && key !== "include")
        .filter(([key, value]) => !(key === "in" && value === "all")),
    );
    return `/browse?${params.toString()}`;
  };
  const shownFamilies = scope === "families" ? families : families.slice(0, 4);
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">نكهات من بيوت أهلنا</p>
        <h1>اكتشف الأكلات</h1>
        <p>ابحث باسم الأكلة أو الأسرة أو القسم، ونعرض لك المتاح أولًا.</p>
      </div>
      <form className="filter-bar" action="/browse" autoComplete="off">
        <fieldset className="search-scope">
          <legend>ابحث في</legend>
          {scopes.map(([key, label]) => (
            <label key={key}>
              <input
                type="radio"
                name="in"
                value={key}
                defaultChecked={scope === key}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="search-query">
          وش طلبك اليوم؟
          <input
            type="search"
            autoComplete="off"
            name="q"
            defaultValue={filters.q}
            placeholder="جريش، مرقوق، اسم الأسرة، قهوة…"
          />
        </label>
        {filters.producer && (
          <input type="hidden" name="producer" value={filters.producer} />
        )}
        <LocationFields
          key={`${filters.region}:${filters.city}`}
          cities={cities}
          defaultRegion={filters.region}
          defaultCity={filters.city}
        />
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
          <select name="status" defaultValue={statusParam}>
            <option value="">المتاح والطلب المسبق</option>
            <option value="available">متوفر الآن</option>
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
      {currentCategory && (branches.length > 0 || parentCategory) && (
        <nav aria-label="فروع القسم" className="category-branches">
          <p>{categoryLabel(currentCategory, categories)}</p>
          <div>
            {parentCategory && (
              <Link href={query({ category: parentCategory.id })}>
                العودة إلى {parentCategory.name}
              </Link>
            )}
            {branches.map((c) => (
              <Link key={c.id} href={query({ category: c.id })}>
                {c.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
      {filters.producer && (
        <div className="family-filter" role="status">
          <p>
            {family ? (
              <>
                منتجات <strong>{family.name}</strong>
                {filters.include ? "" : " المتاحة"}
              </>
            ) : (
              "الأسرة غير موجودة أو غير منشورة"
            )}
          </p>
          <div>
            {family && (
              <Link className="text-link" href={`/producers/${family.slug}`}>
                صفحة الأسرة ←
              </Link>
            )}
            <Link className="text-link" href={query({ producer: "" })}>
              كل الأسر ×
            </Link>
          </div>
        </div>
      )}
      {wantFamilies &&
        !filters.producer &&
        (scope === "families" || families.length > 0) && (
          <section className="search-families" aria-label="أسر مطابقة">
            <div className="results-heading">
              <h2>
                {families.length
                  ? `أسر مطابقة (${families.length})`
                  : "لا توجد أسر مطابقة"}
              </h2>
              {scope === "all" && families.length > 4 && (
                <Link className="text-link" href={query({ in: "families" })}>
                  كل الأسر المطابقة ←
                </Link>
              )}
            </div>
            {shownFamilies.length > 0 && (
              <div className="producer-grid">
                {shownFamilies.map((p) => (
                  <div key={p.id} className="search-family">
                    <ProducerCard producer={p} />
                    <Link
                      className="text-link"
                      href={query({ producer: p.slug, in: "products", q: "" })}
                    >
                      منتجاتها المتاحة ←
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      {scope !== "families" && (
        <>
          <div className="results-heading">
            <h2>
              {products.length
                ? `${products.length} ${filters.include ? "منتج مطابق" : "منتج متاح مطابق"}`
                : "نتائج المنتجات"}
            </h2>
            <Link href="/browse" className="text-link">
              مسح المرشحات
            </Link>
          </div>
          {products.length ? (
            <div className="product-grid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="لم نجد منتجات متاحة بهذه الخيارات"
              text="جرّب كلمة أقصر أو مدينة أخرى، أو اختر «يشمل غير المتوفر»، أو امسح المرشحات. تظهر المنتجات المعتمدة والمنشورة فقط."
            />
          )}
        </>
      )}
    </div>
  );
}
