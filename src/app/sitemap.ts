import type { MetadataRoute } from "next";
import { db, databaseConfigured } from "@/server/db";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://jdatna.com";
  const paths = ["/", "/browse", "/producers", "/about", "/privacy", "/terms"];
  if (databaseConfigured()) {
    const result = await db().query<{ path: string }>(
      `SELECT '/producers/' || slug AS path FROM jdatna.producer_profiles WHERE status='approved'
       UNION ALL
       SELECT '/products/' || x.id::text AS path FROM jdatna.products x
       JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE p.status='approved' AND x.visible=true
       LIMIT 5000`,
    );
    paths.push(...result.rows.map((row) => row.path));
  }
  return paths.map((path) => ({ url: new URL(path, base).href }));
}
