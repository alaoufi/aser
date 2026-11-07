import Link from "next/link";
import type { Product, Producer } from "@/lib/types";

export const availability = {
  available: "متوفر",
  unavailable: "غير متوفر",
  preorder: "حسب الطلب",
};
export function priceLabel(price: number | null) {
  return price === null
    ? "استفسر عن السعر"
    : `${new Intl.NumberFormat("ar-SA").format(price)} ر.س`;
}
export function safeUrl(url: string) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function safeMediaUrl(url: string) {
  return /^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    url,
  )
    ? url
    : safeUrl(url);
}
export function phoneNumber(phone: string) {
  let n = phone.replace(/[\s()+-]/g, "");
  if (/^05\d{8}$/.test(n)) n = "966" + n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  return /^[1-9]\d{6,14}$/.test(n) ? n : null;
}
export function EmptyState({
  title = "الخير في الطريق",
  text = "ستظهر هنا المنتجات والأسر بعد مراجعتها واعتماد نشرها. يمكنك العودة لاحقًا أو الانضمام كأسرة منتجة.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-icon">
        ✧
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <Link className="text-link" href="/register">
        سجّل كأسرة منتجة <span aria-hidden="true">←</span>
      </Link>
    </div>
  );
}
export function ProductCard({ product: p }: { product: Product }) {
  return (
    <Link href={`/products/${p.id}`} className="product-card">
      <div className="card-image">
        {p.imageUrl && safeMediaUrl(p.imageUrl) ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" />
        ) : (
          <span aria-hidden="true">♧</span>
        )}
        <span className="badge">{availability[p.status]}</span>
      </div>
      <div className="card-body">
        <small>
          {p.cityName} · {p.producerName}
        </small>
        <h3>{p.name}</h3>
        <p>
          {priceLabel(p.price)} {p.price !== null && <small>/ {p.unit}</small>}
        </p>
      </div>
    </Link>
  );
}
export function ProducerCard({ producer: p }: { producer: Producer }) {
  return (
    <Link href={`/producers/${p.slug}`} className="producer-card">
      <div className="producer-avatar">
        {p.logoUrl && safeUrl(p.logoUrl) ? (
          <img src={p.logoUrl} alt="" loading="lazy" />
        ) : (
          "⌂"
        )}
      </div>
      <div>
        <small>
          {p.regionName} · {p.cityName}
        </small>
        <h3>{p.name}</h3>
        <p>
          {p.verified ? "تمت مراجعتها إداريًا" : "أسرة منتجة"} ·{" "}
          {p.delivery ? "توصيل متاح" : "استلام بالتنسيق"}
        </p>
      </div>
      <span aria-hidden="true">←</span>
    </Link>
  );
}
export function SectionHeading({
  eyebrow,
  title,
  href,
  label = "عرض الكل",
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {label} <span aria-hidden="true">←</span>
        </Link>
      )}
    </div>
  );
}
export function FoodArt() {
  return (
    <svg
      viewBox="0 0 600 560"
      role="img"
      aria-label="رسم أصلي لطبق تراثي وحبات القمح"
      className="food-art"
    >
      <defs>
        <pattern
          id="grain"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3" cy="3" r="1" fill="#bfa57d" opacity=".3" />
        </pattern>
        <radialGradient id="rice">
          <stop stopColor="#e2b86d" />
          <stop offset="1" stopColor="#ae6b37" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="275" r="230" fill="#e8dcc6" />
      <circle cx="300" cy="275" r="230" fill="url(#grain)" />
      <path
        d="M58 417q52-95 18-228M80 310q-34-12-37-45q31 4 37 45M79 279q32-20 29-51q-27 12-29 51M74 245q-31-12-30-44q26 6 30 44M78 339q34-15 34-47q-28 8-34 47"
        fill="#9b8b50"
        stroke="#817445"
        strokeWidth="3"
      />
      <ellipse
        cx="318"
        cy="421"
        rx="183"
        ry="35"
        fill="#533b25"
        opacity=".12"
      />
      <ellipse cx="304" cy="291" rx="187" ry="159" fill="#a34e30" />
      <ellipse cx="304" cy="278" rx="178" ry="150" fill="#f7ecd7" />
      <ellipse cx="304" cy="277" rx="151" ry="124" fill="url(#rice)" />
      {Array.from({ length: 64 }, (_, i) => {
        const a = i * 2.4,
          r = 15 + Math.sqrt(i) * 15;
        return (
          <ellipse
            key={i}
            cx={304 + Math.cos(a) * r}
            cy={277 + Math.sin(a) * r * 0.78}
            rx="7"
            ry="2.5"
            transform={`rotate(${i * 31} ${304 + Math.cos(a) * r} ${277 + Math.sin(a) * r * 0.78})`}
            fill={i % 3 ? "#f0d096" : "#f7e3b6"}
          />
        );
      })}
      <path
        d="M239 260q29-76 100-36q52 27 8 72q-41 37-86 8q-25-16-22-44"
        fill="#855031"
      />
      <path
        d="M253 258q26-45 70-21M268 281q32 21 60-9"
        fill="none"
        stroke="#b77b45"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <g fill="#5e6d3d">
        <ellipse
          cx="349"
          cy="216"
          rx="17"
          ry="7"
          transform="rotate(-30 349 216)"
        />
        <ellipse
          cx="367"
          cy="229"
          rx="18"
          ry="7"
          transform="rotate(25 367 229)"
        />
        <ellipse
          cx="334"
          cy="207"
          rx="15"
          ry="7"
          transform="rotate(-60 334 207)"
        />
      </g>
      <circle
        cx="218"
        cy="313"
        r="19"
        fill="#e4bc50"
        stroke="#f6de91"
        strokeWidth="5"
      />
      <path
        d="M497 389l-38 30M492 405l-30-34"
        stroke="#9b8b50"
        strokeWidth="4"
      />
      <text
        x="300"
        y="510"
        textAnchor="middle"
        fill="#78654a"
        fontSize="16"
        fontFamily="serif"
      >
        من الموروث… إلى مائدتك
      </text>
    </svg>
  );
}
