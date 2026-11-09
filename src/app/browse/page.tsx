import { categoryLabel } from "@/lib/category-label";
import { LocationFields } from "@/components/public/location-fields";
import type { Metadata } from "next";
import Link from "next/link";
import { getCategories, getCities, searchProducts } from "@/server/catalog";
import { EmptyState, ProductCard } from "@/components/public/ui";
export const metadata: Metadata = { title: "اكتشف الأكلات" };
export const dynamic = "force-dynamic";
export default async function Browse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const val = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : "";
  const filters = {
    q: val("q"),
    city: val("city"),
    region: val("region"),
    category: val("category"),
    status: val("status"),
    delivery: val("delivery"),
  };
  const [categories, cities, products] = await Promise.all([
    getCategories(),
    getCities(),
    searchProducts(filters),
  ]);
  const currentCategory = categories.find((c) => c.id === filters.category);
  const branches = categories.filter((c) => c.parentId === filters.category);
  const parentCategory = categories.find(
    (c) => c.id === currentCategory?.parentId,
  );
  const categoryHref = (id: string) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    params.set("category", id);
    return `/browse?${params.toString()}`;
  };
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">نكهات من بيوت أهلنا</p>
        <h1>اكتشف الأكلات</h1>
        <p>اختر ما تحب، وتواصل مع الأسرة على التفاصيل.</p>
      </div>
      <form className="filter-bar" action="/browse" autoComplete="off">
        <label>
          ابحث عن نكهة
          <input
            type="search"
            autoComplete="off"
            name="q"
            defaultValue={filters.q}
            placeholder="اسم الأكلة أو الأسرة"
          />
        </label>
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
          <select name="status" defaultValue={filters.status}>
            <option value="">كل حالات التوفر</option>
            <option value="available">متوفر</option>
            <option value="preorder">حسب الطلب</option>
            <option value="unavailable">غير متوفر</option>
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
        <button className="button">بحث</button>
      </form>
      {currentCategory && (branches.length > 0 || parentCategory) && (
        <nav aria-label="فروع القسم" className="category-branches">
          <p>{categoryLabel(currentCategory, categories)}</p>
          <div>
            {parentCategory && (
              <Link href={categoryHref(parentCategory.id)}>
                العودة إلى {parentCategory.name}
              </Link>
            )}
            {branches.map((c) => (
              <Link key={c.id} href={categoryHref(c.id)}>
                {c.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <div className="results-heading">
        <p>
          {products.length ? `${products.length} منتج مطابق` : "نتائج البحث"}
        </p>
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
          title="لم نجد منتجات بهذه الخيارات"
          text="جرّب مدينة أو تصنيفًا آخر، أو امسح المرشحات. تظهر المنتجات المعتمدة والمنشورة فقط."
        />
      )}
    </div>
  );
}
