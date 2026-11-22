import { CustomerRequests } from "@/components/forms/customer-requests";
import { getCategories, getCities } from "@/server/catalog";
export const metadata = { title: "طلبات العملاء" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const [cities, categories] = await Promise.all([
    getCities(),
    getCategories(),
  ]);
  return (
    <CustomerRequests
      cities={cities.map((c) => ({
        id: c.id,
        name: c.name,
        regionName: c.regionName,
      }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
