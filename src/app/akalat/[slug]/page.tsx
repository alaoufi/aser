import { T } from "@/components/site-texts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISHES, dishPath, findDish } from "@/lib/dishes";
import { absoluteUrl, excerpt, openGraph } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import { ProductCard } from "@/components/public/ui";
import { searchProducts } from "@/server/catalog";
import { getSiteTexts } from "@/server/settings";
import { productStatusLabels } from "@/lib/site-texts";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dish = findDish((await params).slug);
  if (!dish) return { title: "الأكلات الشعبية" };
  const title = `${dish.name} — أكلة شعبية من بيوت الأسر المنتجة`;
  const description = excerpt(
    `${dish.lead} اطلب ${dish.name} من الأسر المنتجة السعودية في أكلات جدتنا.`,
  );
  return {
    title,
    description,
    alternates: { canonical: dishPath(dish) },
    openGraph: openGraph({ title, description, url: dishPath(dish) }),
  };
}

/** صفحة أكلة شعبية: تعريفها ومكوناتها ومناسبتها، ثم منتجات الأسر المنتجة منها. */
export default async function DishPage({ params }: Props) {
  const dish = findDish((await params).slug);
  if (!dish) notFound();
  const [products, texts] = await Promise.all([
    searchProducts({ q: dish.search }),
    getSiteTexts(),
  ]);
  const others = DISHES.filter((d) => d.slug !== dish.slug);
  return (
    <article className="wrap prose page-space dish-page">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { name: "الرئيسية", path: "/" },
            { name: "الأكلات الشعبية", path: "/akalat" },
            { name: dish.name, path: dishPath(dish) },
          ].map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: absoluteUrl(item.path),
          })),
        }}
      />
      <nav className="dish-crumbs" aria-label="مسار الصفحة">
        <Link href="/">
          <T k="p.akalatOne.t1" />
        </Link>
        <span aria-hidden="true">‹</span>
        <Link href="/akalat">
          <T k="p.akalatOne.t2" />
        </Link>
        <span aria-hidden="true">‹</span>
        <span aria-current="page">{dish.name}</span>
      </nav>
      <p className="eyebrow">
        {dish.kind} · {dish.home}
      </p>
      <h1>{dish.name}</h1>
      <p className="lead">{dish.lead}</p>
      <section>
        <h2>ما هو {dish.name}؟</h2>
        <p>{dish.what}</p>
      </section>
      <section>
        <h2>مكونات {dish.name}</h2>
        <p>{dish.ingredients}</p>
      </section>
      <section>
        <h2>
          <T k="p.akalatOne.t3" />
        </h2>
        <p>{dish.served}</p>
      </section>
      <section aria-labelledby="dish-products">
        <h2 id="dish-products">{dish.name} من الأسر المنتجة</h2>
        {products.length ? (
          <>
            <p>
              <T k="p.akalatOne.t4" />
            </p>
            <div className="product-grid">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  labels={productStatusLabels(texts)}
                />
              ))}
            </div>
            <Link
              className="button"
              href={`/browse?q=${encodeURIComponent(dish.search)}`}
            >
              كل نتائج {dish.name}
            </Link>
          </>
        ) : (
          <>
            <p>
              لا يوجد {dish.name} معروض الآن. تصفّح الأسر المنتجة واطلب منها
              مباشرة، أو عُد قريبًا: تُضاف منتجات جديدة كل يوم.
            </p>
            <div className="dish-actions">
              <Link className="button" href="/producers">
                <T k="p.akalatOne.t5" />
              </Link>
              <Link className="button secondary" href="/register">
                <T k="p.akalatOne.t6" />
              </Link>
            </div>
          </>
        )}
      </section>
      <nav className="dish-more" aria-label="أكلات شعبية أخرى">
        <h2>
          <T k="p.akalatOne.t7" />
        </h2>
        <p>
          {others.map((d) => (
            <Link key={d.slug} href={dishPath(d)} prefetch={false}>
              {d.name}
            </Link>
          ))}
        </p>
      </nav>
    </article>
  );
}
