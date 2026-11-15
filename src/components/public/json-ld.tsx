import { jsonLd } from "@/lib/seo";

/** بيانات منظمة لمحركات البحث (schema.org) تظهر بها الأسعار والتقييمات في نتائج البحث. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: طريقة Next.js الموصى بها لـ JSON-LD؛ jsonLd يحوّل علامة «أصغر من» إلى رمزها فلا يُغلق الوسم ولا يُحقن HTML.
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
