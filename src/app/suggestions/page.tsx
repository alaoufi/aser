import type { Metadata } from "next";
import { getSiteTexts } from "@/server/settings";
import { SuggestionForm } from "@/components/public/suggestion-form";
export const metadata: Metadata = {
  title: "الاقتراحات",
  description: "أرسل اقتراحك لتحسين أكلات جدتنا، ويصل لإدارة الموقع مباشرة.",
};
export const dynamic = "force-dynamic";
/** الاقتراحات: متاحة للجميع، وتصل لمسؤول الإدارة وحده. */
export default async function SuggestionsPage() {
  const texts = await getSiteTexts();
  return (
    <article className="wrap prose page-space">
      <h1>{texts["suggest.title"] || "اقتراحاتكم"}</h1>
      {texts["suggest.intro"] && <p>{texts["suggest.intro"]}</p>}
      <SuggestionForm />
    </article>
  );
}
