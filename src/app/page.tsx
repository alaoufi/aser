import { REGION_COOKIE } from "@/lib/region-cookie";
import { T } from "@/components/site-texts";
import { productStatusLabels } from "@/lib/site-texts";
import { MineBar } from "@/components/public/mine-bar";
import { pageMemberScope } from "@/server/page-member";
import { AdSlot } from "@/components/public/ad-slot";
import { identityProps } from "@/lib/brand";
import { FoodPhotos, PlatesProvider } from "@/components/public/food-photos";
import { SITE_PLATES, type Plate } from "@/lib/site-plates";
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
import { RegionPicker } from "@/components/public/region-picker";
import {
  getCities,
  latestProducts,
  publicCategories,
  regionalProducts,
  todayProducts,
  regionalProducers,
} from "@/server/catalog";
import { ProductCard, ProducerCard } from "@/components/public/ui";
import { ForYou } from "@/components/public/for-you";
import { recentCertificates } from "@/server/certificates";
import { priceLabel } from "@/components/public/ui";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // المنطقة: المختارة في الرابط أو في هذه الزيارة، وإلا «كل المناطق» (قرار المالك 2026-11-26).
  const [cities, jar] = await Promise.all([getCities(), cookies()]);
  const regions = regionsOf(cities);
  const asked = typeof raw.region === "string" ? raw.region : undefined;
  const saved = jar.get(REGION_COOKIE)?.value ?? "";
  const region =
    [asked ?? saved].find((r) => r && regions.some((x) => x.id === r)) ?? "";
  const scope = await pageMemberScope(raw.mine);
  const mine = scope.filters;
  const [
    template,
    texts,
    categories,
    products,
    producers,
    certificates,
    today,
    latest,
  ] = await Promise.all([
    visitorTemplate(),
    getSiteTexts(),
    // لا يظهر القسم إلا إن كان فيه منتج قابل للطلب في نطاق الزائر.
    publicCategories(region),
    // منتجات المنطقة ثم ما يُشحن لكل المناطق، ثم الأسر بنفس الترتيب.
    regionalProducts({ region, mine }, 4),
    regionalProducers({ region, mine }),
    recentCertificates(),
    todayProducts({ region, mine }),
    latestProducts(9),
  ]);
  // صحون أعلى الرئيسية: آخر ١٢ منتجًا لها صور، وصور الموقع تكمّلها إن قلّت (قرار المالك 2026-11-26).
  const plates: Plate[] = [
    ...latest.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.imageUrl ?? "",
      href: `/products/${p.id}`,
      family: p.producerName,
      price: priceLabel(p.price),
      orders: p.orderCount ?? 0,
    })),
  ];
  // صور الموقع لا تُخلط بالمنتجات الحقيقية (قرار المالك 2026-11-27): تظهر وحدها فقط إن لم يكن
  // في الموقع منتج له صورة، فلا يبقى القوس فارغًا.
  if (!plates.length) plates.push(...SITE_PLATES);
  const homeProducts = [...products.local, ...products.nationwide].slice(0, 4);
  const homeProducers = [...producers.local, ...producers.nationwide].slice(
    0,
    6,
  );
  return (
    <>
      {/* «اعرض لي» تحت حزام الرأس مباشرة. */}
      <MineBar scope={scope} path="/" query={{ region: asked ?? "" }} />
      <PlatesProvider plates={plates}>
        <section className="hero wrap">
          <div className="hero-copy">
            {/* عنوان الصفحة لقارئات الشاشة ومحركات البحث فقط؛ النصوص التعريفية حُذفت بطلب المالك. */}
            <h1 className="sr-only">
              <T k="p.home.t1" />
            </h1>
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
              <button
                className="button"
                type="submit"
                aria-label={texts["home.searchButton"] || "ابحث"}
              >
                <span className="hero-search-word">
                  {texts["home.searchButton"] || "ابحث"}
                </span>{" "}
                <span className="hero-search-arrow" aria-hidden="true">
                  ←
                </span>
                {/* الجوال: عدسة بدل الكلمة، فتتسع خانة «وش تطلب اليوم». */}
                <svg
                  className="hero-search-icon"
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  />
                  <path
                    d="m16 16 4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </form>
            {/* المنطقة بجانب «وش تطلب اليوم» في السطر نفسه (وهي منطقة المائدة تحتها أيضًا). */}
            <div className="hero-region">
              <RegionPicker
                regions={regions.map((r) => ({
                  ...r,
                  // «القصيم» بدل «منطقة القصيم»: الاسم كاملًا يُقص في سطر البحث على الجوال.
                  name: r.name.replace(/^منطقة\s+/, ""),
                }))}
                value={region}
                path="/"
              />
            </div>
          </div>
          <div className="hero-visual">
            {template === "najdi" ? <NajdiDoor /> : <FoodPhotos />}
          </div>
          {/* الجوال (النموذج 1 الذي اختاره المالك): تحت الصورة «متوفر الآن» و«اطلب الآن» متجاورتان. */}
          <div className="hero-side">
            <Link href="/browse?status=available" className="hero-chip">
              <span className="hero-chip-icon" aria-hidden="true">
                <span className="status-dot" />
              </span>
              <span className="hero-chip-text">
                <strong>{texts["avail.now"] || "متوفر الآن"}</strong>
                {texts["avail.nowHint"] && (
                  <small>{texts["avail.nowHint"]}</small>
                )}
              </span>
            </Link>
            <Link href="/browse?status=preorder" className="hero-chip warm">
              <span className="hero-chip-icon" aria-hidden="true">
                ◷
              </span>
              <span className="hero-chip-text">
                <strong>{texts["avail.order"] || "اطلب الآن"}</strong>
                {texts["avail.orderHint"] && (
                  <small>{texts["avail.orderHint"]}</small>
                )}
              </span>
            </Link>
          </div>
        </section>
      </PlatesProvider>
      <AdSlot placement="home_top" className="wrap" />
      <TodayTable
        products={today}
        regions={regions}
        region={region}
        capacity={18}
        path="/"
        picker={false}
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
      {/* مقترح لك: للعضو المسجّل، حسب ذوقه (يُحمَّل بعد الصفحة ولا يؤخرها). */}
      <AdSlot placement="home_middle" className="wrap" />
      <ForYou region={region} labels={productStatusLabels(texts)} />
      {homeProducers.length > 0 && (
        <section
          className="section wrap home-producers"
          aria-labelledby="home-producers-title"
        >
          {/* عنوان في الفراغ بين أزرار التوفر وبطاقات الأسر: أسر المنطقة أولًا ثم من يشحن للمملكة. */}
          <div className="section-heading">
            <h2 id="home-producers-title">
              <T k="p.home.t2" />
            </h2>
            <Link className="text-link" href="/producers">
              <T k="p.home.t3" />
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
      <AdSlot placement="home_bottom" className="wrap" />
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
