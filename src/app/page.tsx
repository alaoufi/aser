import { FoodPhotos } from "@/components/public/food-photos";
import Link from "next/link";
import {
  getCategories,
  searchProducts,
  searchProducers,
} from "@/server/catalog";
import {
  EmptyState,
  ProductCard,
  ProducerCard,
  SectionHeading,
} from "@/components/public/ui";
export const dynamic = "force-dynamic";
export default async function Home() {
  const [categories, products, producers] = await Promise.all([
    getCategories(),
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
              <span>وش تطلب اليوم</span>
              <input type="search" name="q" autoComplete="off" />
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
      <section className="section wrap">
        <SectionHeading
          eyebrow="كل نكهة لها باب"
          title="وش خاطرك فيه؟"
          href="/browse"
          label="تصفّح جميع الأكلات"
        />
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
      <section className="availability-section wrap">
        <div>
          <p className="eyebrow">لكل وقت، نكهته</p>
          <h2>
            جاهز اليوم؟
            <br />
            أو على موعد معك.
          </h2>
        </div>
        <Link href="/browse?status=available" className="availability-card">
          <span className="status-dot" />
          <h3>متوفر الآن</h3>
          <p>اكتشف المنتجات المتاحة وتأكد من موعدها مع الأسرة المنتجة.</p>
          <span className="text-link">شوف المتوفر ←</span>
        </Link>
        <Link href="/browse?status=preorder" className="availability-card warm">
          <span aria-hidden="true">◷</span>
          <h3>يتجهّز على طلبك</h3>
          <p>للعزائم واللّمات… نكهات تستاهل الانتظار.</p>
          <span className="text-link">اكتشف حسب الطلب ←</span>
        </Link>
      </section>
      <section className="section wrap">
        <SectionHeading
          eyebrow="أهل الصنعة وأهل الطيب"
          title="تعرّف على الأسر المنتجة"
          href="/producers"
        />
        {producers.length ? (
          <div className="producer-grid">
            {producers.slice(0, 4).map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="هنا تبدأ حكايات الأسر"
            text="نفتح المساحة للأسر المنتجة. ستظهر الملفات العامة هنا بعد اكتمال مراجعتها والموافقة على نشرها."
          />
        )}
      </section>
      <section className="section wrap">
        <SectionHeading
          eyebrow="جديد المائدة"
          title="نكهات تستحق الاكتشاف"
          href="/browse"
        />
        {products.length ? (
          <div className="product-grid">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="المائدة تنتظر أولى نكهاتها"
            text="لا توجد منتجات منشورة حاليًا. كل منتج سيظهر بمعلوماته الحقيقية وسعره أو خيار الاستفسار من الأسرة المنتجة."
          />
        )}
      </section>
      <section className="join-banner wrap">
        <div>
          <p className="eyebrow">لأهل الصنعة، مكان بيننا</p>
          <h2>
            طبختك لها محبّين.
            <br />
            خلّهم يوصلون لك.
          </h2>
          <p>
            عرّف الناس بمنتجاتك، واحكِ حكايتك، وتواصل معهم مباشرة.
            <br />
            التسجيل مجاني وبدون عمولات أو اشتراكات حاليًا، من زر الدخول أعلى
            الصفحة.
          </p>
        </div>
        <div className="join-ornament" aria-hidden="true">
          ✳
        </div>
      </section>
    </>
  );
}
