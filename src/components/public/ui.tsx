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
      <Link className="text-link" href="/login">
        تسجيل الدخول <span aria-hidden="true">←</span>
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
      <div className="producer-avatar" aria-hidden="true">
        {p.logoUrl && safeMediaUrl(p.logoUrl) ? (
          <img src={p.logoUrl} alt="" loading="lazy" />
        ) : (
          p.name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join(" ")
        )}
      </div>
      <div className="producer-card-content">
        <small className="producer-location">
          {p.regionName} · {p.cityName}
        </small>
        <h3>{p.name}</h3>
        {p.description && (
          <p className="producer-description">{p.description}</p>
        )}
        <div className="producer-tags">
          {p.verified && (
            <span className="producer-verified">
              <span aria-hidden="true">✓</span> تمت مراجعتها
            </span>
          )}
          <span>{p.delivery ? "توصيل متاح" : "استلام بالتنسيق"}</span>
        </div>
      </div>
      <span className="producer-card-arrow" aria-hidden="true">
        ←
      </span>
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
