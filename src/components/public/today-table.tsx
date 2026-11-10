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

/** باقة ورد واقفة في مزهرية فخار، عائمة فوق المائدة الفارغة إلى أن تصل العروض. */
function Bouquet() {
  // وردة جورية: طبقات بتلات متدرجة حول قلب ملتف.
  const roses: [
    x: number,
    y: number,
    r: number,
    outer: string,
    inner: string,
  ][] = [
    [90, 46, 19, "#b8321f", "#7f1d12"],
    [60, 66, 15, "#e9836a", "#c2412b"],
    [120, 68, 15, "#f2b8a0", "#d7745a"],
    [76, 92, 13, "#c2412b", "#8f2416"],
    [106, 96, 13, "#f4ead9", "#e0b48a"],
  ];
  // زهور صغيرة بخمس بتلات.
  const blossoms: [
    x: number,
    y: number,
    r: number,
    petal: string,
    core: string,
  ][] = [
    [42, 92, 9, "#f4ead9", "#d6a35c"],
    [138, 94, 9, "#f0c35a", "#b8321f"],
    [92, 76, 8, "#f4ead9", "#c2412b"],
    [52, 44, 7, "#e9836a", "#f4ead9"],
    [130, 42, 7, "#f4ead9", "#d6a35c"],
  ];
  const leaf = (x: number, y: number, angle: number) => (
    <path
      key={`${x}-${y}`}
      d={`M${x} ${y}c-10-4-16-12-16-22 10 2 17 10 16 22z`}
      fill="#5f7a3a"
      transform={`rotate(${angle} ${x} ${y})`}
    />
  );
  return (
    <span className="table-bouquet-wrap" aria-hidden="true">
      <svg
        className="table-bouquet"
        viewBox="0 0 180 250"
        width="180"
        height="250"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="jd-vase" x1="0" x2="1">
            <stop offset="0" stopColor="#f0b98a" />
            <stop offset="0.35" stopColor="#d48c59" />
            <stop offset="1" stopColor="#8c4524" />
          </linearGradient>
          <radialGradient id="jd-rose" cx="0.35" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#000" stopOpacity="0.18" />
          </radialGradient>
        </defs>
        <g stroke="#4f6b30" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M90 150 90 60M90 150 62 70M90 150 120 72M90 150 76 96M90 150 106 100M90 152 44 96M90 152 136 98M90 150 54 48M90 150 128 46" />
        </g>
        {leaf(70, 120, -40)}
        {leaf(112, 118, 40)}
        {leaf(56, 104, -70)}
        {leaf(126, 106, 70)}
        {leaf(90, 112, 0)}
        {blossoms.map(([x, y, r, petal, core]) => (
          <g key={`b${x}-${y}`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse
                key={a}
                cx={x}
                cy={y - r * 0.55}
                rx={r * 0.5}
                ry={r * 0.66}
                fill={petal}
                transform={`rotate(${a} ${x} ${y})`}
              />
            ))}
            <circle cx={x} cy={y} r={r * 0.36} fill={core} />
          </g>
        ))}
        {roses.map(([x, y, r, outer, inner]) => (
          <g key={`r${x}-${y}`}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <circle
                key={a}
                cx={x + Math.cos((a * Math.PI) / 180) * r * 0.42}
                cy={y + Math.sin((a * Math.PI) / 180) * r * 0.42}
                r={r * 0.6}
                fill={outer}
              />
            ))}
            <circle cx={x} cy={y} r={r * 0.62} fill={inner} />
            <circle cx={x} cy={y} r={r} fill="url(#jd-rose)" />
            <path
              d={`M${x - r * 0.35} ${y}a${r * 0.35} ${r * 0.35} 0 1 1 ${r * 0.35} ${r * 0.3}`}
              stroke={outer}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        ))}
        {/* مزهرية فخار بحزام سدو */}
        <path
          d="M66 150h48c0 8-6 12-6 18 0 14 22 24 22 46 0 22-18 32-40 32s-40-10-40-32c0-22 22-32 22-46 0-6-6-10-6-18z"
          fill="url(#jd-vase)"
          stroke="#f4ead9"
          strokeOpacity="0.7"
          strokeWidth="2"
        />
        <path
          d="M66 150h48c0 8-6 12-6 18 0 14 22 24 22 46 0 22-18 32-40 32"
          fill="#a85d34"
          opacity="0.35"
        />
        <rect x="62" y="146" width="56" height="8" rx="4" fill="#8a4424" />
        <path d="M52 204h76v12H52z" fill="#2e1d12" opacity="0.85" />
        <path
          d="M52 216l6-12 6 12 6-12 6 12 6-12 6 12 6-12 6 12 6-12 6 12 6-12 6 12z"
          fill="#d6a35c"
        />
        <path
          d="M58 210h4M70 210h4M82 210h4M94 210h4M106 210h4M118 210h4"
          stroke="#b8321f"
          strokeWidth="3"
        />
        <ellipse
          cx="76"
          cy="186"
          rx="5"
          ry="14"
          fill="#f4ead9"
          opacity="0.18"
        />
      </svg>
    </span>
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
              <span className="table-bouquet-shadow" aria-hidden="true" />
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
        {shown.length === 0 && <Bouquet />}
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
