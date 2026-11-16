import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
/** يُفهرس كل ما يراه الزائر، وتُستبعد صفحات الحسابات الخاصة. خريطة الموقع معلنة لكل المحركات. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/api/media/"],
      disallow: [
        "/dashboard",
        "/admin",
        "/api",
        "/login",
        "/register",
        "/me",
        "/messages",
        "/orders",
        "/courier",
        "/couriers",
      ],
    },
    sitemap: SITE_URL + "/sitemap.xml",
    host: SITE_URL,
  };
}
