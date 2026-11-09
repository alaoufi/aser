import { FoodPhotos } from "@/components/public/food-photos";
import Link from "next/link";
import {
  publicCategories,
  searchProducts,
  searchProducers,
} from "@/server/catalog";
import { ProductCard, ProducerCard } from "@/components/public/ui";
export const dynamic = "force-dynamic";
export default async function Home() {
  // لا يظهر القسم للعامة إلا إذا اختارته أسرة معتمدة وعليه منتج منشور.
  const [categories, products, producers] = await Promise.all([
    publicCategories(),
    searchProducts({}),
    searchProducers({}),
  ]);
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          {/* عنوان الصفحة لقارئات الشاشة ومحركات البحث فقط؛ النصوص التعريفية حُذفت بطلب المالك. */}
          <h1 className="sr-only">أكلات جدتنا وأصالة الماضي</h1>
          <form action="/browse" className="hero-search" autoComplete="off">
            <label>
              <span className="sr-only">وش تطلب اليوم</span>
              <input
                type="search"
                name="q"
                autoComplete="off"
                placeholder="وش تطلب اليوم"
              />
            </label>
            <button className="button" type="submit">
              ابحث <span aria-hidden="true">←</span>
            </button>
          </form>
        </div>
        <div className="hero-visual">
          <FoodPhotos />
        </div>
      </section>
      {categories.length > 0 && (
        <section className="section wrap" aria-label="الأقسام">
          <div className="category-grid">
            {categories
              .filter((c) => !c.parentId)
              .sort(
                (a, b) =>
                  (a.id === "13" || a.id === "14" ? -1 : 0) -
                  (b.id === "13" || b.id === "14" ? -1 : 0),
              )
              .map((c, i) => (
                <Link
                  href={`/browse?category=${encodeURIComponent(c.id)}`}
                  key={c.id}
                  className="category-card"
                >
                  <span
                    className={`category-icon tone-${i % 4}`}
                    aria-hidden="true"
                  >
                    {
                      [
                        "♨",
                        "◉",
                        "◌",
                        "♧",
                        "✿",
                        "❧",
                        "⬡",
                        "◈",
                        "✺",
                        "☕",
                        "☀",
                        "✧",
                      ][i % 12]
                    }
                  </span>
                  <div className="category-title">
                    <h3>{c.name}</h3>
                    {categories.some((child) => child.parentId === c.id) && (
                      <small>
                        {categories
                          .filter((child) => child.parentId === c.id)
                          .map((child) => child.name)
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                  <span className="category-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}
      <section className="availability-section wrap" aria-label="التوفر">
        <Link href="/browse?status=available" className="availability-card">
          <span className="status-dot" />
          <h3>متوفر الآن</h3>
        </Link>
        <Link href="/browse?status=preorder" className="availability-card warm">
          <span aria-hidden="true">◷</span>
          <h3>اطلب الآن</h3>
        </Link>
      </section>
      {producers.length > 0 && (
        <section className="section wrap" aria-label="الأسر المنتجة">
          <div className="producer-grid">
            {producers.slice(0, 4).map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        </section>
      )}
      {products.length > 0 && (
        <section className="section wrap" aria-label="جديد المائدة">
          <div className="product-grid">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
