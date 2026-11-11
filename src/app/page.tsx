import { FoodPhotos } from "@/components/public/food-photos";
import { NajdiDoor } from "@/components/public/najdi-door";
import { getSiteTexts, visitorTemplate } from "@/server/settings";
import Link from "next/link";
import { cookies } from "next/headers";
import { TodayTable, regionsOf } from "@/components/public/today-table";
import {
  getCities,
  publicCategories,
  searchProducts,
  todayProducts,
  searchProducers,
} from "@/server/catalog";
import { ProductCard, ProducerCard } from "@/components/public/ui";
import { recentCertificates } from "@/server/certificates";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // كل ما لا يعتمد على المنطقة يُطلب معًا بالتوازي بدل التسلسل.
  const [
    cities,
    jar,
    template,
    texts,
    categories,
    products,
    producers,
    certificates,
  ] = await Promise.all([
    getCities(),
    cookies(),
    visitorTemplate(),
    getSiteTexts(),
    // لا يظهر القسم للعامة إلا إذا اختارته أسرة معتمدة وعليه منتج منشور.
    publicCategories(),
    searchProducts({}),
    searchProducers({}),
    recentCertificates(),
  ]);
  const regions = regionsOf(cities);
  // منطقة المائدة: المختارة في الرابط، وإلا المحفوظة في الجهاز.
  const asked = typeof raw.region === "string" ? raw.region : undefined;
  const saved = jar.get("jdatna_region")?.value ?? "";
  const region =
    [asked ?? saved].find((r) => r && regions.some((x) => x.id === r)) ?? "";
  const today = await todayProducts({ region });
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          {/* عنوان الصفحة لقارئات الشاشة ومحركات البحث فقط؛ النصوص التعريفية حُذفت بطلب المالك. */}
          <h1 className="sr-only">أكلات جدتنا وأصالة الماضي</h1>
          <form action="/browse" className="hero-search" autoComplete="off">
            <label>
              <span className="sr-only">
                {texts["home.search"] || "وش تطلب اليوم"}
              </span>
              <input
                type="search"
                name="q"
                autoComplete="off"
                placeholder={texts["home.search"]}
              />
            </label>
            <button className="button" type="submit">
              {texts["home.searchButton"] || "ابحث"}{" "}
              <span aria-hidden="true">←</span>
            </button>
          </form>
        </div>
        <div className="hero-visual">
          {template === "najdi" ? <NajdiDoor /> : <FoodPhotos />}
        </div>
      </section>
      <TodayTable
        products={today}
        regions={regions}
        region={region}
        capacity={12}
        path="/"
        texts={texts}
      />
      {certificates.length > 0 && texts["certificate.announce"] && (
        <section
          className="wrap certificate-news"
          aria-label="أسر حصلت على شهادة تميّز"
        >
          {certificates.map((c) => (
            <p key={c.id}>
              <span className="certificate-news-icon" aria-hidden="true">
                ★
              </span>
              <span>
                {texts["certificate.announce"].replace("{name}", c.familyName)}
              </span>
              <Link href={`/certificates/${c.id}`}>
                {texts["certificate.announceLink"] || "عرض الشهادة"}{" "}
                <span aria-hidden="true">←</span>
              </Link>
            </p>
          ))}
        </section>
      )}
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
          <h3>{texts["avail.now"] || "متوفر الآن"}</h3>
        </Link>
        <Link href="/browse?status=preorder" className="availability-card warm">
          <span aria-hidden="true">◷</span>
          <h3>{texts["avail.order"] || "اطلب الآن"}</h3>
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
