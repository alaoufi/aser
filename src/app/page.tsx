import { productStatusLabels } from "@/lib/site-texts";
import { identityProps } from "@/lib/brand";
import { FoodPhotos } from "@/components/public/food-photos";
import { NajdiDoor } from "@/components/public/najdi-door";
import { getSiteTexts, visitorTemplate } from "@/server/settings";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE_DESCRIPTION, openGraph } from "@/lib/seo";
// الرئيسية: عنوان ووصف بكلمات البحث الأكثر طلبًا، ورابطها المعتمد.
export const metadata: Metadata = {
  title: {
    absolute: "أكلات جدتنا | أكلات شعبية وطبخ بيت من الأسر المنتجة السعودية",
  },
  alternates: { canonical: "/" },
  openGraph: openGraph({
    url: "/",
    title: "أكلات جدتنا | أكلات شعبية وطبخ بيت من الأسر المنتجة",
    description: SITE_DESCRIPTION,
  }),
};
import { cookies } from "next/headers";
import { TodayTable, regionsOf } from "@/components/public/today-table";
import {
  getCities,
  publicCategories,
  regionalProducts,
  todayProducts,
  regionalProducers,
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
  // المنطقة أولًا (المختارة في الرابط، وإلا المحفوظة في الجهاز)، ثم كل ما يُعرض يتبعها.
  const [cities, jar] = await Promise.all([getCities(), cookies()]);
  const regions = regionsOf(cities);
  const asked = typeof raw.region === "string" ? raw.region : undefined;
  const saved = jar.get("jdatna_region")?.value ?? "";
  const region =
    [asked ?? saved].find((r) => r && regions.some((x) => x.id === r)) ?? "";
  const [
    template,
    texts,
    categories,
    products,
    producers,
    certificates,
    today,
  ] = await Promise.all([
    visitorTemplate(),
    getSiteTexts(),
    // لا يظهر القسم إلا إن كان فيه منتج قابل للطلب في نطاق الزائر.
    publicCategories(region),
    // منتجات المنطقة ثم ما يُشحن لكل المناطق، ثم الأسر بنفس الترتيب.
    regionalProducts({ region }, 4),
    regionalProducers({ region }),
    recentCertificates(),
    todayProducts({ region }),
  ]);
  const homeProducts = [...products.local, ...products.nationwide].slice(0, 4);
  const homeProducers = [...producers.local, ...producers.nationwide].slice(
    0,
    6,
  );
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
                  {...categoryIdentity(c.id, c.frame)}
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
      {homeProducers.length > 0 && (
        <section
          className="section wrap home-producers"
          aria-labelledby="home-producers-title"
        >
          {/* عنوان في الفراغ بين أزرار التوفر وبطاقات الأسر: أسر المنطقة أولًا ثم من يشحن للمملكة. */}
          <div className="section-heading">
            <h2 id="home-producers-title">أسر منتجة تغطي منطقتك</h2>
            <Link className="text-link" href="/producers">
              كل الأسر المنتجة ←
            </Link>
          </div>
          <div className="producer-grid compact">
            {homeProducers.map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        </section>
      )}
      {homeProducts.length > 0 && (
        <section className="section wrap" aria-label="جديد المائدة">
          <div className="product-grid">
            {homeProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                labels={productStatusLabels(texts)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** بطاقة القسم بهويته (البرواز) على أرضية الموقع الهادئة. */
function categoryIdentity(id: string, frame?: string | null) {
  const p = identityProps(
    "site",
    { palette: "c8-4", pattern: "plain", effect: "soft", scale: 2 },
    { categoryId: id, chosen: frame },
  );
  return { className: `category-card ${p.className}`, style: p.style };
}
