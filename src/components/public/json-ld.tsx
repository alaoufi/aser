import { jsonLd } from "@/lib/seo";

/** بيانات منظمة لمحركات البحث (schema.org) تظهر بها الأسعار والتقييمات في نتائج البحث. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
