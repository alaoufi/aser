import { cookies } from "next/headers";
import { Offers } from "@/components/forms/offers";
import { RegionPicker } from "@/components/public/region-picker";
import { regionsOf } from "@/components/public/today-table";
import { getCities } from "@/server/catalog";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "العروض الخاصة على أكل البيت",
  description:
    "عروض الأسر المنتجة على الأكلات الشعبية وطبخ البيت: عروض الفطور والغداء والعشاء والمناسبات في منطقتك.",
  alternates: { canonical: "/offers" },
};
/** العروض في نطاق الزائر: منطقته (تلقائيًا من موقعه)، وما يُشحن لكل المناطق. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [cities, jar] = await Promise.all([getCities(), cookies()]);
  const regions = regionsOf(cities);
  const asked = typeof raw.region === "string" ? raw.region : undefined;
  const saved = jar.get("jdatna_region")?.value ?? "";
  const region =
    [asked ?? saved].find((r) => r && regions.some((x) => x.id === r)) ?? "";
  return (
    <Offers
      region={region}
      scope={
        <div className="browse-scope">
          <span>نطاقك:</span>
          <RegionPicker regions={regions} value={region} path="/offers" />
        </div>
      }
    />
  );
}
