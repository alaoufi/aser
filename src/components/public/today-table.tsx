import Link from "next/link";
import type { Product } from "@/lib/types";
import { priceLabel, safeMediaUrl } from "./ui";
import { RegionPicker } from "./region-picker";

export type Region = { id: string; name: string };
/** يرتب المناطق من قائمة المدن بلا تكرار. */
export function regionsOf(
  cities: { regionId: string; regionName: string }[],
): Region[] {
  const map = new Map<string, string>();
  for (const c of cities) map.set(c.regionId, c.regionName);
  return [...map].map(([id, name]) => ({ id, name }));
}

/** «مائدة اليوم»: المتوفر اليوم من أطباق الأسر في المنطقة المختارة، على طاولة. */
export function TodayTable({
  products,
  regions,
  region,
  capacity,
  path,
}: {
  products: Product[];
  regions: Region[];
  region: string;
  /** عدد الأطباق التي تتسع لها الطاولة؛ بدونه تعرض الكل. */
  capacity?: number;
  path: string;
}) {
  const shown = capacity ? products.slice(0, capacity) : products;
  const regionName = regions.find((r) => r.id === region)?.name;
  const full = `/table${region ? `?region=${encodeURIComponent(region)}` : ""}`;
  return (
    <section
      className={`today-table wrap${capacity ? "" : " is-full"}`}
      aria-labelledby="today-table-title"
    >
      <div className="today-table-head">
        <h2 id="today-table-title">مائدة اليوم</h2>
        <RegionPicker regions={regions} value={region} path={path} />
      </div>
      <div className="table-top">
        {shown.length === 0 ? (
          <p className="table-empty">
            الطبخات لم تصل بعد
            {regionName ? <small>في {regionName}</small> : null}
          </p>
        ) : (
          <ul className="table-dishes">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="table-dish">
                  <span className="plate">
                    {p.imageUrl && safeMediaUrl(p.imageUrl) ? (
                      <img src={p.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">♨</span>
                    )}
                  </span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.producerName} · {priceLabel(p.price)}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {capacity && products.length > 0 && (
        <Link href={full} className="table-more">
          {products.length > shown.length
            ? `افتح المائدة كاملة (${products.length} طبق) ←`
            : "افتح المائدة كاملة ←"}
        </Link>
      )}
    </section>
  );
}
