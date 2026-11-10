import Link from "next/link";
import type { Product } from "@/lib/types";
import { priceLabel, safeMediaUrl } from "./ui";
import { RegionPicker } from "./region-picker";
import type { SiteTexts } from "@/lib/site-texts";
import { TableCarousel } from "./table-carousel";

export type Region = { id: string; name: string };
/** يرتب المناطق من قائمة المدن بلا تكرار. */
export function regionsOf(
  cities: { regionId: string; regionName: string }[],
): Region[] {
  const map = new Map<string, string>();
  for (const c of cities) map.set(c.regionId, c.regionName);
  return [...map].map(([id, name]) => ({ id, name }));
}

/** باقة ورد على المائدة الفارغة، ترحيبًا إلى أن تصل العروض. */
function Bouquet() {
  const flowers: [
    x: number,
    y: number,
    r: number,
    petal: string,
    core: string,
  ][] = [
    [60, 34, 15, "#c2412b", "#f0c35a"],
    [38, 48, 12, "#f4ead9", "#d6a35c"],
    [84, 50, 12, "#e58a6f", "#f4ead9"],
    [50, 66, 10, "#d6a35c", "#9c2f1e"],
    [74, 70, 10, "#c2412b", "#f0c35a"],
    [28, 72, 9, "#e58a6f", "#f4ead9"],
    [94, 76, 9, "#f4ead9", "#c2412b"],
  ];
  return (
    <svg
      className="table-bouquet"
      viewBox="0 0 120 150"
      width="120"
      height="150"
      aria-hidden="true"
    >
      <g stroke="#4f5d36" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M60 128 60 40M60 120 40 50M60 120 84 52M60 122 50 68M60 122 74 72M60 124 30 74M60 124 92 78" />
      </g>
      <g fill="#6b7d45">
        <path d="M60 96c-12-6-18-2-22 4 8 2 14 2 22-4z" />
        <path d="M60 90c12-8 19-4 23 2-8 3-15 3-23-2z" />
      </g>
      {flowers.map(([x, y, r, petal, core]) => (
        <g key={`${x}-${y}`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx={x}
              cy={y - r * 0.55}
              rx={r * 0.48}
              ry={r * 0.62}
              fill={petal}
              transform={`rotate(${a} ${x} ${y})`}
            />
          ))}
          <circle cx={x} cy={y} r={r * 0.36} fill={core} />
        </g>
      ))}
      <path
        d="M30 96h60l-20 50H50z"
        fill="#f4ead9"
        stroke="#d6a35c"
        strokeWidth="2"
      />
      <path d="M30 96 50 146M90 96 70 146" stroke="#e8d6b4" strokeWidth="1.5" />
      <path
        d="M46 112c8 4 20 4 28 0M60 114c-8 8-14 10-18 8M60 114c8 8 14 10 18 8"
        stroke="#9c2f1e"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** «مائدة اليوم»: المتوفر اليوم من أطباق الأسر في المنطقة المختارة، على طاولة. */
export function TodayTable({
  products,
  regions,
  region,
  capacity,
  path,
  texts,
}: {
  texts: Pick<
    SiteTexts,
    | "table.title"
    | "table.empty"
    | "table.more"
    | "table.prev"
    | "table.next"
    | "delivery.kingdom"
    | "table.emptyRegion"
    | "region.auto"
    | "region.detecting"
  >;
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
        <h2
          id="today-table-title"
          className={texts["table.title"] ? undefined : "sr-only"}
        >
          {texts["table.title"] || "مائدة اليوم"}
        </h2>
        <RegionPicker
          regions={regions}
          value={region}
          path={path}
          autoLabel={texts["region.auto"]}
          detectingLabel={texts["region.detecting"]}
        />
      </div>
      {/* مائدة خشب كبيرة ثلاثية الأبعاد بأرجل قصيرة */}
      <div className="table-3d">
        <div className="table-top">
          {/* علامة مائية على الجوانب الأربعة، كل واحدة تُقرأ من جهة الجالس أمامها */}
          {(["bottom", "top", "right", "left"] as const).map((side) => (
            <span
              key={side}
              className={`table-watermark is-${side}`}
              aria-hidden="true"
            >
              {texts["table.title"] || "مائدة اليوم"}
            </span>
          ))}
          {shown.length === 0 ? (
            <div className="table-empty">
              <Bouquet />
              <p>
                {texts["table.empty"]}
                {region && texts["table.emptyRegion"] ? (
                  <small title={regionName}>{texts["table.emptyRegion"]}</small>
                ) : null}
              </p>
            </div>
          ) : capacity ? (
            <TableCarousel
              prevLabel={texts["table.prev"] || "الأطباق السابقة"}
              nextLabel={texts["table.next"] || "الأطباق التالية"}
            >
              <ul className={`table-dishes${capacity ? " is-row" : ""}`}>
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
                      {p.deliveryScope === "kingdom" &&
                        texts["delivery.kingdom"] && (
                          <em className="dish-shipping">
                            {texts["delivery.kingdom"]}
                          </em>
                        )}
                    </Link>
                  </li>
                ))}
              </ul>
            </TableCarousel>
          ) : (
            <ul className={`table-dishes${capacity ? " is-row" : ""}`}>
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
                    {p.deliveryScope === "kingdom" &&
                      texts["delivery.kingdom"] && (
                        <em className="dish-shipping">
                          {texts["delivery.kingdom"]}
                        </em>
                      )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="table-leg leg-1" aria-hidden="true" />
        <span className="table-leg leg-2" aria-hidden="true" />
        <span className="table-leg leg-3" aria-hidden="true" />
        <span className="table-leg leg-4" aria-hidden="true" />
      </div>
      {capacity && products.length > 0 && (
        <Link href={full} className="table-more">
          {products.length > shown.length
            ? `${texts["table.more"] || "افتح المائدة كاملة"} (${products.length} طبق) ←`
            : `${texts["table.more"] || "افتح المائدة كاملة"} ←`}
        </Link>
      )}
    </section>
  );
}
