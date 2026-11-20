import type { Metadata } from "next";
import Link from "next/link";
import { DISHES, dishPath } from "@/lib/dishes";
import { absoluteUrl, openGraph } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import { publicCategories } from "@/server/catalog";

export const dynamic = "force-dynamic";
const title = "الأكلات الشعبية السعودية — جريش ومرقوق وقرصان وكبسة";
const description =
  "دليل الأكلات الشعبية السعودية: جريش، قرصان، مرقوق، مطازيز، كبسة، معصوب، حنيني، كليجا، معمول وسمبوسة. تعرّف على كل أكلة واطلبها طبخ بيت من الأسر المنتجة.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/akalat" },
  openGraph: openGraph({ title, description, url: "/akalat" }),
};

/** الصفحة الجامعة للأكلات الشعبية: كل أكلة بصفحتها، ثم أقسام المنتجات المعروضة. */
export default async function Dishes() {
  const categories = (await publicCategories()).filter((c) => !c.parentId);
  return (
    <article className="wrap prose page-space dish-page">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "الأكلات الشعبية السعودية",
          itemListElement: DISHES.map((d, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: d.name,
            url: absoluteUrl(dishPath(d)),
          })),
        }}
      />
      <p className="eyebrow">شعبيات من بيوت الأسر المنتجة</p>
      <h1>الأكلات الشعبية السعودية</h1>
      <p className="lead">
        أكلات شعبية وطبخ بيت كما تطبخه الجدات: اختر الأكلة لتعرف مكوناتها
        ومناسبتها، واطلبها من الأسر المنتجة مباشرة.
      </p>
      <ul className="dish-list">
        {DISHES.map((d) => (
          <li key={d.slug}>
            <Link href={dishPath(d)}>
              <span className="dish-list-kind">{d.kind}</span>
              <strong>{d.name}</strong>
              <span>{d.lead}</span>
            </Link>
          </li>
        ))}
      </ul>
      {categories.length > 0 && (
        <nav className="dish-more" aria-label="أقسام المنتجات">
          <h2>أقسام المنتجات المعروضة</h2>
          <p>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/browse?category=${encodeURIComponent(c.id)}`}
                prefetch={false}
              >
                {c.name}
              </Link>
            ))}
          </p>
        </nav>
      )}
      <div className="dish-actions">
        <Link className="button" href="/browse">
          طبخات اليوم المتاحة
        </Link>
        <Link className="button secondary" href="/producers">
          الأسر المنتجة
        </Link>
      </div>
    </article>
  );
}
