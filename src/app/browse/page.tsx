import { productStatusLabels } from "@/lib/site-texts";
import { AdSlot } from "@/components/public/ad-slot";
import { categoryLabel } from "@/lib/category-label";
import { LocationFields } from "@/components/public/location-fields";
import type { Metadata } from "next";
import { openGraph } from "@/lib/seo";
import { dishPath, findDish } from "@/lib/dishes";
import { cookies } from "next/headers";
import { RegionPicker } from "@/components/public/region-picker";
import { regionsOf } from "@/components/public/today-table";
import Link from "next/link";
import {
  browseLists,
  getCategories,
  publicCategories,
  getCities,
  getProducer,
  normalizeArabic,
  searchProducers,
  searchProducts,
  searchWords,
} from "@/server/catalog";
import { EmptyState, ProducerCard, ProductCard } from "@/components/public/ui";
import { understandFood } from "@/lib/food-intent";
import { UnderstoodRequest } from "@/components/public/understood-request";
import { getSiteTexts } from "@/server/settings";
// عنوان التبويب يتبع القسم أو الأسرة المنتجة المفتوحة.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const raw = await searchParams;
  const one = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
  const category = one("category"),
    producer = one("producer"),
    region = one("region"),
    q = one("q").slice(0, 60);
  // عنوان ووصف بكلمات البحث الدلالية، ورابط معتمد واحد لكل صفحة بحث (لا تكرار في الفهرس).
  const page = (title: string, description: string, canonical: string) => ({
    title,
    description,
    alternates: { canonical },
    openGraph: openGraph({ title, description, url: canonical }),
  });
  if (category) {
    const found = (await getCategories()).find((c) => c.id === category);
    if (found)
      return page(
        `${found.name} — أكل بيت من الأسر المنتجة`,
        `${found.name} من بيوت الأسر المنتجة السعودية: أكلات شعبية وطبخ بيت بالتوصيل أو الاستلام. اطلب ${found.name} من الأسرة مباشرة في أكلات جدتنا.`,
        `/browse?category=${encodeURIComponent(found.id)}`,
      );
  }
  if (producer) {
    const found = await getProducer(producer);
    if (found)
      return page(
        `منتجات ${found.name}`,
        `أكلات ${found.name}، أسرة منتجة في ${found.cityName}: أكل بيت وأكلات شعبية تطلبها من الأسرة مباشرة.`,
        `/browse?producer=${encodeURIComponent(found.slug)}`,
      );
  }
  if (region) {
    const found = (await getCities()).find((c) => c.regionId === region);
    if (found)
      return page(
        `أكلات شعبية وأسر منتجة في ${found.regionName}`,
        `أكل بيت وأكلات شعبية من الأسر المنتجة في ${found.regionName}: جريش وقرصان ومرقوق وكبسة وحلويات شعبية بالتوصيل أو الاستلام.`,
        `/browse?region=${encodeURIComponent(region)}`,
      );
  }
  if (q) {
    // البحث باسم أكلة لها صفحة في الدليل: الرابط المعتمد صفحتها، فلا تتنافس صفحتان على الكلمة نفسها.
    const dish = findDish(q);
    return page(
      `${q} — أكل بيت من الأسر المنتجة`,
      `اطلب ${q} أكل بيت من الأسر المنتجة السعودية في أكلات جدتنا، بالتوصيل أو الاستلام من الأسرة مباشرة.`,
      dish ? dishPath(dish) : `/browse?q=${encodeURIComponent(q)}`,
    );
  }
  return page(
    "طبخات اليوم — أكلات شعبية وطبخ بيت",
    "طبخات اليوم من الأسر المنتجة السعودية: أكلات شعبية وطبخ بيت متاح الآن قريب منك، تطلبه من الأسرة مباشرة.",
    "/browse",
  );
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
  // النطاق: المنطقة المختارة في الرابط، وإلا المحفوظة في الجهاز (تُحدَّد تلقائيًا من الموقع).
  const regionParam = typeof raw.region === "string" ? raw.region : undefined;
  const savedRegion = (await cookies()).get("jdatna_region")?.value ?? "";
  // التفاهم: جملة طلب بكلام العميل («أبي غدا لعشرة بالرياض بميزانية 300») تُفهم قبل البحث:
  // الأكلة تصير كلمة البحث، والمكان يصير النطاق. الكلمة الواحدة تبقى بحثًا عاديًا.
  const asked = val("q").trim();
  const [knownCities, knownCategories] = await Promise.all([
    getCities(),
    publicCategories(),
  ]);
  const understood =
    asked && !val("producer") && !val("category")
      ? understandFood(asked, {
          cities: knownCities,
          categories: knownCategories,
        })
      : null;
  const request = understood?.isRequest ? understood : null;
  const filters = {
    q: request ? request.search : asked,
    city: request?.place?.cityId ?? val("city"),
    region: request?.place?.regionId ?? regionParam ?? savedRegion,
    category: val("category"),
    status: statusParam === "all" ? "" : statusParam,
    include: statusParam === "all" ? "all" : "",
    delivery: val("delivery"),
    producer: val("producer"),
  };
  const texts = await getSiteTexts();
  const showFamilyDirectory = by === "family" && !filters.producer;
  const showCategoryDirectory = by === "category" && !filters.category;
  const listProducts = !showFamilyDirectory && !showCategoryDirectory;
  // منتجات المنطقة أولًا، ثم ما يُشحن لكل المناطق (دون تكرار). منتجات أسرة بعينها لا تُقيَّد بالمنطقة.
  const scoped =
    listProducts &&
    !filters.producer &&
    Boolean(filters.region || filters.city);
  const [
    allCategories,
    categories,
    cities,
    lists,
    products,
    families,
    family,
    nationwide,
  ] = await Promise.all([
    getCategories(),
    publicCategories(),
    getCities(),
    browseLists({ region: filters.region, city: filters.city }),
    listProducts
      ? searchProducts(request ? { ...filters, match: "any" } : filters)
      : Promise.resolve([]),
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
    scoped
      ? searchProducts({
          ...filters,
          region: "",
          city: "",
          scope: "kingdom",
          notRegion: filters.city ? "" : filters.region,
          notCity: filters.city,
        })
      : Promise.resolve([]),
  ]);
  const regions = regionsOf(cities);
  const regionName =
    cities.find((c) => c.id === filters.city)?.name ??
    regions.find((r) => r.id === filters.region)?.name ??
    "";
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
  // القسم المفتوح يُبحث في كل الأقسام؛ القوائم العامة تعرض الظاهر فقط.
  const currentCategory = allCategories.find((c) => c.id === filters.category);
  const branches = categories.filter((c) => c.parentId === filters.category);
  const parentCategory = allCategories.find(
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
              ? categoryLabel(parentCategory, allCategories)
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
          <h1>{texts["browse.title"] || "طبخات اليوم"}</h1>
          {texts["browse.subtitle"] && <p>{texts["browse.subtitle"]}</p>}
        </div>
      )}
      <AdSlot placement="browse_top" />
      {request && (
        <UnderstoodRequest
          intent={request}
          asked={asked}
          regions={regionsOf(knownCities)}
        />
      )}
      {/* النطاق: يُحدَّد تلقائيًا من موقع الزائر، ويُغيَّر من القائمة. */}
      {!filters.producer && (
        <div className="browse-scope">
          <span>نطاقك:</span>
          <RegionPicker
            regions={regions}
            value={filters.region}
            path="/browse"
            query={{
              by: by === "word" ? "" : by,
              q: filters.q,
              category: filters.category,
              status: val("status"),
              delivery: filters.delivery,
            }}
          />
        </div>
      )}
      <details
        className="filter-wrap browse-search"
        open={Boolean(filters.q) || (by !== "word" && !focus)}
      >
        <summary>
          <span aria-hidden="true">🔍</span> بحث
        </summary>
        <form className="filter-bar" action="/browse" autoComplete="off">
          {by !== "word" && <input type="hidden" name="by" value={by} />}
          {by === "word" && !focus ? (
            <label className="search-query">
              وش تطلب اليوم
              <input
                type="search"
                autoComplete="off"
                name="q"
                defaultValue={asked}
                placeholder="جريش، مرقوق، أو اكتب طلبك: أبي غدا لعشرة بالرياض"
              />
            </label>
          ) : (
            filters.q && <input type="hidden" name="q" value={filters.q} />
          )}
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
              <option value="preorder">
                {productStatusLabels(texts).preorder}
              </option>
              <option value="all">
                يشمل «{productStatusLabels(texts).unavailable}»
              </option>
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
      </details>
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
          {topCategories.length === 0 && (
            <EmptyState
              title="لا توجد أقسام فيها منتجات بعد"
              text="تظهر الأقسام هنا عندما تنشر الأسر المنتجة منتجاتها."
            />
          )}
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
                ? `${products.length} ${filters.include ? "منتج مطابق" : "منتج متاح"}${focus === "category" && currentCategory ? ` في ${currentCategory.name}` : ""}${scoped && regionName ? ` في ${regionName}` : ""}`
                : widened.length
                  ? "لا تطابق تام — نتائج قريبة"
                  : scoped && regionName
                    ? `لا يوجد متاح في ${regionName} الآن`
                    : "نتائج المنتجات"}
            </h2>
            <Link
              href={
                focus === "category" && currentCategory
                  ? `/browse?category=${encodeURIComponent(currentCategory.id)}`
                  : focus === "family" && family
                    ? `/browse?producer=${encodeURIComponent(family.slug)}`
                    : by === "word"
                      ? "/browse"
                      : `/browse?by=${by}`
              }
              className="text-link"
            >
              مسح فلتر البحث
            </Link>
          </div>
          {products.length || widened.length ? (
            <div className="product-grid">
              {(products.length ? products : widened).map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  labels={productStatusLabels(texts)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                scoped && regionName
                  ? `لا توجد منتجات متاحة في ${regionName} بهذه الخيارات`
                  : "لم نجد منتجات بهذه الخيارات"
              }
              text={
                scoped
                  ? "جرّب منطقة أخرى من «نطاقك»، أو انظر ما يُشحن لكل المناطق أدناه."
                  : "جرّب «حسب القسم» أو «حسب الأسرة المنتجة»، أو كلمة أقصر، أو امسح فلتر البحث. تظهر المنتجات المعتمدة والمنشورة فقط."
              }
            />
          )}
          {nationwide.length > 0 && (
            <section aria-label="يُشحن لكل المناطق" className="nationwide">
              <div className="results-heading">
                <h2>يُشحن لكل المناطق ({nationwide.length})</h2>
              </div>
              <div className="product-grid">
                {nationwide.map((p) => (
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
      )}
      <AdSlot placement="browse_bottom" />
    </div>
  );
}
