import type { MetadataRoute } from "next";
import { db, databaseConfigured } from "@/server/db";
import { SITE_URL } from "@/lib/seo";
export const dynamic = "force-dynamic";
type Entry = MetadataRoute.Sitemap[number];
/**
 * خريطة الموقع: الصفحات العامة، والأقسام والمناطق (صفحات بحث حقيقية)، وكل أسرة معتمدة ومنتج ظاهر،
 * مع تاريخ آخر تحديث حتى تعيد المحركات زيارة ما تغيّر.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => new URL(path, SITE_URL).href;
  const entries: Entry[] = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/browse"), changeFrequency: "hourly", priority: 0.9 },
    { url: url("/producers"), changeFrequency: "daily", priority: 0.9 },
    { url: url("/offers"), changeFrequency: "daily", priority: 0.7 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/support"), changeFrequency: "monthly", priority: 0.3 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
  if (!databaseConfigured()) return entries;
  const rows = (
    await db().query<{ path: string; updated: Date | null; kind: string }>(
      `SELECT '/browse?category=' || c.id AS path, NULL::timestamptz AS updated, 'category' AS kind
         FROM jdatna.categories c
         WHERE NOT c.hidden AND EXISTS (SELECT 1 FROM jdatna.product_categories pc JOIN jdatna.products x ON x.id=pc.product_id
           JOIN jdatna.producer_profiles p ON p.id=x.producer_id
           WHERE pc.category_id=c.id AND x.visible AND x.deleted_at IS NULL AND p.status='approved' AND NOT p.review_only)
       UNION ALL
       SELECT '/browse?region=' || r.id, NULL, 'region' FROM jdatna.regions r
         WHERE EXISTS (SELECT 1 FROM jdatna.producer_profiles p JOIN jdatna.cities ct ON ct.id=p.city_id
           WHERE ct.region_id=r.id AND p.status='approved' AND NOT p.review_only)
       UNION ALL
       SELECT '/producers/' || slug, updated_at, 'producer' FROM jdatna.producer_profiles
         WHERE status='approved' AND NOT review_only
       UNION ALL
       (SELECT '/products/' || x.id::text, x.updated_at, 'product' FROM jdatna.products x
         JOIN jdatna.producer_profiles p ON p.id=x.producer_id
         WHERE p.status='approved' AND NOT p.review_only AND x.visible AND x.deleted_at IS NULL
         ORDER BY x.updated_at DESC LIMIT 5000)`,
    )
  ).rows;
  for (const r of rows)
    entries.push({
      url: url(r.path),
      ...(r.updated ? { lastModified: r.updated } : {}),
      changeFrequency: r.kind === "product" ? "daily" : "weekly",
      priority: r.kind === "category" || r.kind === "region" ? 0.8 : 0.7,
    });
  return entries;
}
