import Link from "next/link";
import type { Product, Producer } from "@/lib/types";
import { productStatusLabels } from "@/lib/site-texts";
import { Stars } from "./stars";
import { identityProps } from "@/lib/brand";

/** الأسماء الأصلية لحالة المنتج؛ الصفحات تمرر المعدّل من «نصوص الموقع». */
export const availability = productStatusLabels();
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
    </div>
  );
}
/** المنتج يدمج الهويتين: خلفية أسرته وزخرفتها وتأثيرها، داخل إطار قسمه. */
export function productIdentity(p: Product) {
  return identityProps(p.producerId ?? p.id, p.brand, {
    categoryId: p.primaryCategory ?? p.categoryIds?.[0],
    chosen: p.frame,
  });
}
export function ProductCard({
  product: p,
  labels = availability,
  extra,
}: {
  product: Product;
  /** أسماء حالة المنتج من «نصوص الموقع». */
  labels?: Record<string, string>;
  /** إضافة أسفل البطاقة (عدد المشاهدات في صفحة الأسرة). */
  extra?: React.ReactNode;
}) {
  const id = productIdentity(p);
  return (
    <Link
      href={`/products/${p.id}`}
      className={`product-card ${id.className}`}
      style={id.style}
    >
      <div className="card-image">
        {p.imageUrl && safeMediaUrl(p.imageUrl) ? (
          <img src={p.imageUrl} alt={p.name} loading="lazy" />
        ) : (
          <span aria-hidden="true">♧</span>
        )}
        <span className="badge">
          {p.notCookingToday ? "لا يوجد طبخ اليوم" : labels[p.status]}
        </span>
      </div>
      <div className="card-body">
        <small>
          {p.cityName} · {p.producerName}
        </small>
        <h3>{p.name}</h3>
        <p>
          {priceLabel(p.price)} {p.price !== null && <small>/ {p.unit}</small>}
        </p>
        {p.deliveryScope === "kingdom" && (
          <small className="shipping-badge">شحن لكل المملكة</small>
        )}
        {extra}
      </div>
    </Link>
  );
}
export function ProducerCard({ producer: p }: { producer: Producer }) {
  const id = identityProps(p.id ?? p.slug, p.brand);
  return (
    <Link
      href={`/producers/${p.slug}`}
      className={`producer-card ${id.className}`}
      style={id.style}
    >
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
          <Stars
            value={p.ratingAverage ?? null}
            count={p.ratingCount ?? 0}
            size={14}
          />
          {p.notCookingToday && <span>لا يوجد طبخ اليوم</span>}
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

/** نص من الإدارة: السطر الجديد يظهر كسطر جديد. */
export function Lines({ text }: { text: string }) {
  const parts = text.split("\n");
  return parts.map((line, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: الأسطر ثابتة الترتيب
    <span key={i}>
      {line}
      {i < parts.length - 1 && <br />}
    </span>
  ));
}
