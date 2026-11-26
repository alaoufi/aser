import { T } from "@/components/site-texts";
import { cookies } from "next/headers";
import { MineBar } from "@/components/public/mine-bar";
import { pageMemberScope } from "@/server/page-member";
import { AdSlot } from "@/components/public/ad-slot";
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
  const scope = await pageMemberScope(raw.mine);
  return (
    <>
      <MineBar scope={scope} path="/offers" query={{ region: asked ?? "" }} />
      <Offers
        region={region}
        mine={scope.active.join(",")}
        scope={
          <>
            <div className="browse-scope">
              <span>
                <T k="p.offers.t1" />
              </span>
              <RegionPicker regions={regions} value={region} path="/offers" />
            </div>
            <AdSlot placement="offers_top" />
          </>
        }
      />
    </>
  );
}
