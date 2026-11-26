import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import { priceLabel, safeMediaUrl } from "@/components/public/ui";
import { maedaColors, type MaedaStyle } from "@/lib/maeda";

/**
 * «المائدة» — روح القالب المبسّط (قرار المالك 2026-11-26): أطباق اليوم الحقيقية صحونًا كبيرة على مفرش سدو
 * يمتد بعرض الشاشة. أكبر عنصر في الصفحة ومحورها؛ تُستعمل في الرئيسية ومائدة كل أسرة في صفحتها.
 * بلا أطباق: الصحن المعتمد على المفرش مع رسالة لائقة وزر. النصوص كلها تُمرَّر من «نصوص الموقع».
 * «السُّفرة الممدودة» (2026-11-26): الصحون تقف **على** المفرش وأسماؤها على بطاقات فوقه، واسم الأسرة
 * مكتوب على المائدة نفسها بمادتها. `cloth` يختار شكل المائدة من «مكتبة الموائد» (السدو افتراضيًا).
 */
export const maedaCloths = [
  "sadu",
  "abyad",
  "nahas",
  "khoos",
  "qatt",
  "zal",
  "tabliya",
] as const;
export type MaedaCloth = (typeof maedaCloths)[number];

export function MaedaTable({
  id,
  title,
  hint,
  dishes,
  showFamily = true,
  all,
  empty,
  owner,
  cloth = "sadu",
  maeda = null,
  preview,
}: {
  id: string;
  title: string;
  hint?: string;
  dishes: Product[];
  /** اسم الأسرة تحت كل طبق (الرئيسية)، لا في مائدة الأسرة نفسها. */
  showFamily?: boolean;
  all?: { href: string; label: string };
  empty: {
    title: string;
    text?: string;
    cta?: { href: string; label: string };
  };
  /** اسم صاحب المائدة مكتوبًا على المفرش (مائدة الأسرة). */
  owner?: string;
  cloth?: MaedaCloth;
  /** مائدة الأسرة من «صانع المائدة»؛ null = مائدة السدو الأصلية. */
  maeda?: MaedaStyle | null;
  /** معاينة لوحة الأسرة: صور توضيحية بلا روابط ولا بطاقات. */
  preview?: string[];
}) {
  const made = maeda
    ? {
        "data-shape": maeda.shape,
        "data-finish": maeda.finish,
        "data-edge": maeda.edge === "none" ? undefined : maeda.edge,
        "data-runner": maeda.runner ? "on" : undefined,
        style: { "--tc": maedaColors[maeda.color] } as React.CSSProperties,
      }
    : { "data-cloth": cloth };
  return (
    <section className="maeda" {...made} aria-labelledby={id}>
      <div className="maeda-top wrap">
        <h2 id={id} className="maeda-name">
          {title}
        </h2>
        {hint && <p className="maeda-hint">{hint}</p>}
      </div>
      <div
        className={`maeda-board ${dishes.length || preview ? "" : "is-empty"}`}
      >
        <div className="maeda-cloth" aria-hidden="true" />
        {preview ? (
          <ul className="maeda-dishes" aria-hidden="true">
            {preview.map((src) => (
              <li key={src}>
                <span className="maeda-dish">
                  <span className="maeda-dish-plate">
                    <img src={src} alt="" />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : dishes.length > 0 ? (
          <ul className="maeda-dishes">
            {dishes.map((p, i) => {
              const image = p.imageUrl && safeMediaUrl(p.imageUrl);
              return (
                <li key={p.id} className={i === 0 ? "is-first" : undefined}>
                  <Link href={`/products/${p.id}`} className="maeda-dish">
                    <span className="maeda-dish-plate">
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          loading={i < 2 ? "eager" : "lazy"}
                        />
                      ) : (
                        <span className="maeda-dish-initial" aria-hidden="true">
                          {p.name.trim().charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="maeda-tag">
                      <strong>{p.name}</strong>
                      {showFamily && <small>{p.producerName}</small>}
                      <span className="maeda-price">
                        {priceLabel(p.price)}
                        {p.price !== null && <small> / {p.unit}</small>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="maeda-empty">
            <Image
              className="maeda-empty-dish"
              src="/food/traditional-platter-floating-v2.webp"
              alt=""
              width={420}
              height={420}
              sizes="(max-width:760px) 260px, 340px"
              preload
              fetchPriority="high"
              loading="eager"
            />
            <div className="maeda-empty-text">
              <strong>{empty.title}</strong>
              {empty.text && <p>{empty.text}</p>}
              {empty.cta && (
                <Link className="button secondary" href={empty.cta.href}>
                  {empty.cta.label}
                </Link>
              )}
            </div>
          </div>
        )}
        {/* اسم صاحب المائدة مكتوب عليها بمادتها، تحت الصحون فلا يتداخل معها. */}
        {owner && (
          <p className="maeda-owner">
            <span>{owner}</span>
          </p>
        )}
      </div>
      {all && dishes.length > 0 && (
        <div className="wrap maeda-all">
          <Link className="text-link" href={all.href}>
            {all.label} ←
          </Link>
        </div>
      )}
    </section>
  );
}
