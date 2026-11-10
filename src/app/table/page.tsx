import { cookies } from "next/headers";
import type { Metadata } from "next";
import { getCities, todayProducts } from "@/server/catalog";
import { getSiteTexts } from "@/server/settings";
import { TodayTable, regionsOf } from "@/components/public/today-table";
export const metadata: Metadata = {
  title: "مائدة اليوم",
  description: "كل الأطباق المتوفرة اليوم من الأسر المنتجة في منطقتك.",
};
export const dynamic = "force-dynamic";
export default async function TablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const cities = await getCities();
  const regions = regionsOf(cities);
  const asked = typeof raw.region === "string" ? raw.region : undefined;
  const saved = (await cookies()).get("jdatna_region")?.value ?? "";
  const region =
    [asked ?? saved].find((r) => r && regions.some((x) => x.id === r)) ?? "";
  const products = await todayProducts({ region });
  return (
    <div className="page-space">
      <TodayTable
        products={products}
        regions={regions}
        region={region}
        path="/table"
        texts={await getSiteTexts()}
      />
    </div>
  );
}
