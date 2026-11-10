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

type P = [x: number, y: number, r: number];
const rot = (a: number, x: number, y: number) => `rotate(${a} ${x} ${y})`;
/** وردة جورية: طبقات بتلات حول قلب ملتف، بلمعة تعطيها عمقًا. */
function Rose({
  x,
  y,
  r,
  c,
  d,
}: {
  x: number;
  y: number;
  r: number;
  c: string;
  d: string;
}) {
  return (
    <g>
      {[0, 51, 103, 154, 206, 257, 309].map((a) => (
        <circle
          key={a}
          cx={x + Math.cos((a * Math.PI) / 180) * r * 0.45}
          cy={y + Math.sin((a * Math.PI) / 180) * r * 0.45}
          r={r * 0.58}
          fill={c}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.66} fill={d} />
      <path
        d={`M${x - r * 0.42} ${y + r * 0.05}a${r * 0.42} ${r * 0.4} 0 1 1 ${r * 0.5} ${r * 0.34}M${x - r * 0.18} ${y}a${r * 0.2} ${r * 0.2} 0 1 1 ${r * 0.24} ${r * 0.14}`}
        stroke={c}
        strokeWidth={r * 0.13}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={x} cy={y} r={r} fill="url(#jd-shine)" />
    </g>
  );
}
/** زهرة ببتلات حول قلب: أقحوان، جربيرا. */
function Petals({
  x,
  y,
  r,
  n,
  c,
  core,
  w = 0.28,
}: {
  x: number;
  y: number;
  r: number;
  n: number;
  c: string;
  core: string;
  w?: number;
}) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <ellipse
          key={i}
          cx={x}
          cy={y - r * 0.55}
          rx={r * w}
          ry={r * 0.5}
          fill={c}
          transform={rot((360 / n) * i, x, y)}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.3} fill={core} />
      <circle
        cx={x - r * 0.08}
        cy={y - r * 0.08}
        r={r * 0.12}
        fill="#fff"
        opacity="0.35"
      />
    </g>
  );
}

/** باقة ورد كثيفة في مزهرية برونزية، واقفة على المائدة الفارغة إلى أن تصل العروض. */
function Bouquet() {
  const leaves: [x: number, y: number, a: number, l: number][] = [
    [62, 150, -60, 34],
    [52, 120, -80, 30],
    [70, 96, -40, 28],
    [178, 150, 60, 34],
    [188, 118, 80, 30],
    [170, 92, 40, 28],
    [96, 176, -20, 30],
    [146, 176, 20, 30],
    [120, 60, 0, 26],
    [40, 160, -100, 26],
    [200, 160, 100, 26],
    [86, 70, -25, 22],
    [156, 68, 25, 22],
    [120, 186, 0, 24],
  ];
  const sprigs: [x: number, y: number, a: number][] = [
    [34, 104, -55],
    [206, 104, 55],
    [28, 140, -80],
    [212, 140, 80],
    [74, 44, -20],
    [168, 44, 20],
  ];
  const rosesData: [number, number, number, string, string][] = [
    [100, 128, 22, "#b23a2f", "#7c1f17"],
    [150, 80, 18, "#c8463a", "#8b241a"],
    [70, 64, 15, "#e58b80", "#c45d55"],
    [168, 128, 14, "#e9a093", "#c96a60"],
  ];
  const daisies: P[] = [
    [120, 92, 18],
    [86, 102, 14],
    [140, 118, 15],
    [58, 128, 12],
    [178, 102, 12],
    [112, 50, 12],
    [194, 136, 10],
  ];
  const peonies: [number, number, number][] = [
    [124, 148, 22],
    [176, 160, 15],
  ];
  const marigolds: P[] = [
    [150, 152, 12],
    [82, 152, 10],
    [140, 174, 9],
  ];
  return (
    <span className="table-bouquet-wrap" aria-hidden="true">
      <svg
        className="table-bouquet"
        viewBox="0 0 240 274"
        width="240"
        height="274"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="jd-vase" x1="0" x2="1">
            <stop offset="0" stopColor="#c49a6c" />
            <stop offset="0.3" stopColor="#8a6244" />
            <stop offset="1" stopColor="#3e2a1d" />
          </linearGradient>
          <radialGradient id="jd-shine" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </radialGradient>
        </defs>
        {/* ظل التلامس على الخشب، ثم المزهرية مقصّرة كما تُرى من فوق */}
        <ellipse
          cx="120"
          cy="262"
          rx="54"
          ry="11"
          fill="#1a0f08"
          opacity="0.45"
        />
        <ellipse
          cx="120"
          cy="260"
          rx="36"
          ry="7"
          fill="#1a0f08"
          opacity="0.4"
        />
        <g transform="translate(0 174) scale(1 0.78) translate(0 -174)">
          <path
            d="M92 174h56c-2 10-8 14-8 22 0 10 22 22 22 48 0 24-18 40-42 40s-42-16-42-40c0-26 22-38 22-48 0-8-6-12-8-22z"
            fill="url(#jd-vase)"
          />
          <ellipse
            cx="120"
            cy="175"
            rx="30"
            ry="10"
            fill="#3a271b"
            stroke="#d9b98f"
            strokeWidth="1.5"
          />
          <path
            d="M88 230c20 6 44 6 64 0M86 244c22 7 46 7 68 0"
            stroke="#b48a5f"
            strokeWidth="2"
            fill="none"
            opacity="0.7"
          />
          <path
            d="M98 208c-6 14-8 34-2 54"
            stroke="#f4ead9"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
            opacity="0.18"
          />
        </g>
        {/* سيقان من فوهة المزهرية إلى الزهور */}
        <g stroke="#4b6b3e" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M120 180 100 128M120 180 150 80M120 180 70 64M120 180 168 128M120 180 120 92M120 180 86 102M120 180 140 118M120 180 58 128M120 180 178 102M120 180 196 58M120 180 42 118M120 180 124 148M120 180 176 160" />
        </g>
        {/* أغصان */}
        <g stroke="#3f5a3a" strokeWidth="2" strokeLinecap="round" fill="none">
          {sprigs.map(([x, y, a]) => (
            <g key={`s${x}`} transform={rot(a, x, y)}>
              <path d={`M${x} ${y + 40}V${y - 6}`} />
              {[0, 9, 18, 27].map((o) => (
                <path key={o} d={`M${x} ${y + o}l-7-6M${x} ${y + o}l7-6`} />
              ))}
            </g>
          ))}
        </g>
        {leaves.map(([x, y, a, l]) => (
          <ellipse
            key={`l${x}-${y}`}
            cx={x}
            cy={y - l / 2}
            rx={l * 0.22}
            ry={l / 2}
            fill={a % 40 === 0 ? "#4b6b45" : "#5f7f56"}
            transform={rot(a, x, y)}
          />
        ))}
        {/* براعم وتوليب */}
        {[
          [44, 82, -35, "#e8919a"],
          [196, 82, 35, "#ef9aa2"],
          [126, 30, 8, "#c8463a"],
          [92, 36, -15, "#f2b28c"],
        ].map(([x, y, a, c]) => (
          <path
            key={`b${x}`}
            d={`M${x} ${y}c-7-8-6-18 0-22 6 4 7 14 0 22z`}
            fill={c as string}
            transform={rot(a as number, x as number, y as number)}
          />
        ))}
        {peonies.map(([x, y, r]) => (
          <g key={`p${x}`}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <circle
                key={a}
                cx={x + Math.cos((a * Math.PI) / 180) * r * 0.42}
                cy={y + Math.sin((a * Math.PI) / 180) * r * 0.42}
                r={r * 0.6}
                fill="#f6b48c"
              />
            ))}
            <circle cx={x} cy={y} r={r * 0.62} fill="#f9cba8" />
            <circle cx={x} cy={y} r={r * 0.3} fill="#e99a6e" />
            <circle cx={x} cy={y} r={r} fill="url(#jd-shine)" />
          </g>
        ))}
        {marigolds.map(([x, y, r]) => (
          <g key={`m${x}`}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <circle
                key={i}
                cx={x + Math.cos(i) * r * 0.55}
                cy={y + Math.sin(i * 1.3) * r * 0.5}
                r={r * 0.42}
                fill={i % 2 ? "#f08a2c" : "#e5701c"}
              />
            ))}
          </g>
        ))}
        <Petals
          x={196}
          y={58}
          r={20}
          n={18}
          c="#ee6a2b"
          core="#7a2f12"
          w={0.2}
        />
        <Petals
          x={42}
          y={118}
          r={14}
          n={16}
          c="#f08a3a"
          core="#7a2f12"
          w={0.2}
        />
        {daisies.map(([x, y, r]) => (
          <Petals
            key={`d${x}-${y}`}
            x={x}
            y={y}
            r={r}
            n={14}
            c="#fbf7ee"
            core="#f0a321"
            w={0.22}
          />
        ))}
        {rosesData.map(([x, y, r, c, d]) => (
          <Rose key={`r${x}`} x={x} y={y} r={r} c={c} d={d} />
        ))}
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
