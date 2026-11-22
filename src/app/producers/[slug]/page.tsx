import { productStatusLabels } from "@/lib/site-texts";
import { AdSlot } from "@/components/public/ad-slot";
import { identityProps } from "@/lib/brand";
import { ReportButton } from "@/components/public/report-button";
import { getPublicCoverage } from "@/server/coverage";
import { ShareButton } from "@/components/public/share-button";
import {
  FamilyViews,
  FamilyViewsSummary,
  ProductViewBadge,
} from "@/components/public/visit-stats";
import { ChatButton } from "@/components/forms/chat";
import { LocationLink } from "@/components/forms/location-share";
import { LocationCheck } from "@/components/maps/location-check";
import { RatingBox } from "@/components/forms/rating-box";
import { getSiteTexts } from "@/server/settings";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  countProducerProducts,
  getProducer,
  getProducerProducts,
} from "@/server/catalog";
import {
  ProductCard,
  EmptyState,
  phoneNumber,
  safeUrl,
  safeMediaUrl,
  priceLabel,
} from "@/components/public/ui";
import { JsonLd } from "@/components/public/json-ld";
import { shortLink } from "@/server/share";
import { SITE_URL, absoluteUrl, excerpt, openGraph } from "@/lib/seo";
export const dynamic = "force-dynamic";
/** «عدد المنتجات المعروضة» بصيغة العدد العربية. */
function productsLabel(n: number) {
  if (!n) return "لا منتجات معروضة بعد";
  const count = n.toLocaleString("en-US");
  if (n === 1) return "منتج واحد معروض";
  if (n === 2) return "منتجان معروضان";
  if (n % 100 >= 3 && n % 100 <= 10) return `${count} منتجات معروضة`;
  if (n >= 100 && n % 100 <= 2) return `${count} منتج معروض`;
  return `${count} منتجًا معروضًا`;
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await getProducer((await params).slug);
  if (!p)
    return { title: "الأسرة المنتجة غير موجودة", robots: { index: false } };
  const title = `${p.name} — أسرة منتجة في ${p.cityName}`;
  const description = excerpt(
    `${p.name} أسرة منتجة في ${p.cityName}${p.neighborhood ? " حي " + p.neighborhood : ""}، ${p.regionName}: أكل بيت وأكلات شعبية` +
      (p.delivery ? " بالتوصيل" : "") +
      (p.pickup ? " والاستلام" : "") +
      `. ${p.description}`,
  );
  const image = p.logoUrl && safeMediaUrl(p.logoUrl);
  return {
    title,
    description,
    alternates: { canonical: `/producers/${p.slug}` },
    openGraph: openGraph({
      title,
      description,
      url: `/producers/${p.slug}`,
      ...(image ? { images: [{ url: image, alt: p.name }] } : {}),
    }),
  };
}
export default async function ProducerDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await getProducer((await params).slug);
  if (!p) notFound();
  const [products, shown, texts, share] = await Promise.all([
    getProducerProducts(p.id),
    countProducerProducts(p.id),
    getSiteTexts(),
    shortLink("family", p.id),
  ]);
  const coverage = p.delivery ? await getPublicCoverage(p.id) : [];
  const phone = p.phone ? phoneNumber(p.phone) : null;
  const whatsapp = p.whatsapp ? phoneNumber(p.whatsapp) : null;
  const logo = p.logoUrl && safeMediaUrl(p.logoUrl);
  return (
    <FamilyViews id={p.id}>
      <div className="wrap page-space">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FoodEstablishment",
            "@id": absoluteUrl(`/producers/${p.slug}#family`),
            name: p.name,
            description: excerpt(p.description, 500) || undefined,
            url: absoluteUrl(`/producers/${p.slug}`),
            ...(logo
              ? { image: absoluteUrl(logo), logo: absoluteUrl(logo) }
              : {}),
            servesCuisine: ["أكلات شعبية سعودية", "طبخ بيت"],
            address: {
              "@type": "PostalAddress",
              addressLocality: p.cityName,
              addressRegion: p.regionName,
              addressCountry: "SA",
            },
            ...(p.phone ? { telephone: p.phone } : {}),
            ...(p.ratingAverage && p.ratingCount
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: p.ratingAverage,
                    ratingCount: p.ratingCount,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }
              : {}),
            ...(products.length
              ? {
                  hasMenu: {
                    "@type": "Menu",
                    hasMenuItem: products.slice(0, 30).map((x) => ({
                      "@type": "MenuItem",
                      name: x.name,
                      url: absoluteUrl(`/products/${x.id}`),
                      ...(x.price !== null
                        ? {
                            offers: {
                              "@type": "Offer",
                              price: x.price,
                              priceCurrency: "SAR",
                            },
                          }
                        : {}),
                    })),
                  },
                }
              : {}),
            isPartOf: { "@id": SITE_URL + "/#website" },
          }}
        />
        <div className="page-top">
          <Link href="/producers" className="text-link">
            الأسر المنتجة ←
          </Link>
          <ShareButton
            title={p.name}
            url={share}
            text={`منتجات ${p.name} في أكلات جدتنا — أكل بيت من ${p.cityName}`}
            image={logo || null}
          />
        </div>
        <section
          className={`profile-header ${identityProps(p.id, p.brand).className}`}
          style={identityProps(p.id, p.brand).style}
        >
          <div className="profile-symbol" aria-hidden="true">
            ⌂
          </div>
          <div>
            <p className="eyebrow">
              {p.regionName} · {p.cityName}
            </p>
            <h1>{p.name}</h1>
            <p className="view-count">
              <span aria-hidden="true">🍲</span> {productsLabel(shown)}
            </p>
            <FamilyViewsSummary />
            {p.notCookingToday && (
              <p role="status" className="muted">
                لا يوجد طبخ اليوم. طلبات المواعيد القادمة متاحة بالاتفاق مع
                الأسرة المنتجة.
              </p>
            )}
            {p.certificateId && (
              <Link
                className="badge inline distinguished-badge"
                href={`/certificates/${p.certificateId}`}
              >
                <span aria-hidden="true">★</span>{" "}
                {texts["certificate.badge"] || "أسرة مميزة"}
              </Link>
            )}
            <p className="profile-description">{p.description}</p>
          </div>
        </section>
        <AdSlot placement="producer_page" />
        <div className="detail-grid">
          <section>
            <h2>من مائدة الأسرة المنتجة</h2>
            {products.length ? (
              <div className="product-grid two">
                {products.map((item) => (
                  <ProductCard
                    key={item.id}
                    product={item}
                    labels={productStatusLabels(texts)}
                    extra={<ProductViewBadge id={item.id} />}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="لم تُنشر منتجات بعد"
                text="تابع هذه الصفحة للتعرف على منتجات الأسرة المنتجة عند نشرها."
              />
            )}
          </section>
          <aside className="info-panel">
            <h2>تواصل مع الأسرة المنتجة</h2>
            <p>اتفق مباشرة على السعر والكمية ووقت التجهيز والاستلام.</p>
            <RatingBox
              kind="family"
              target={p.id}
              title={texts["rating.family"] || "تقييم الأسرة المنتجة"}
              prompt={texts["rating.prompt"] || "رأيك مهم؟"}
            />
            <div className="contact-actions">
              <ChatButton producerSlug={p.slug} />
              {phone && (
                <a href={`tel:+${phone}`} className="button">
                  اتصل بالأسرة المنتجة
                </a>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`السلام عليكم، وصلت لكم من أكلات جدتنا\n${share || SITE_URL}`)}`}
                  className="button secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  تواصل عبر واتساب ↗
                </a>
              )}
            </div>
            <hr />
            <h3>التوصيل والاستلام</h3>
            <p>
              {p.delivery
                ? "التوصيل متاح بالتنسيق مع الأسرة المنتجة."
                : "التوصيل غير متاح."}
            </p>
            <p>{p.pickup ? "الاستلام متاح بالتنسيق المباشر." : ""}</p>
            {p.delivery && Boolean(coverage.length) && (
              <ul>
                {coverage.map((area) => (
                  <li key={area.nodeId}>
                    {area.label} —{" "}
                    {area.fee === null
                      ? "رسوم التوصيل بالاتفاق"
                      : area.fee === 0
                        ? "توصيل مجاني"
                        : priceLabel(area.fee)}
                  </li>
                ))}
              </ul>
            )}
            {p.delivery && <LocationCheck producerSlug={p.slug} />}
            {p.publicLocation ? (
              <LocationLink label="موقع الأسرة" location={p.publicLocation} />
            ) : (
              <p className="muted">
                يُشارك موقع الاستلام الدقيق معك بالتنسيق الخاص؛ لا يُعرض عنوان
                المنزل علنًا.
              </p>
            )}
            {p.businessHours && (
              <>
                <h3>أوقات العمل</h3>
                <p className="pre-line">{p.businessHours}</p>
              </>
            )}
            {p.socialLinks.length > 0 && (
              <>
                <h3>تابع الأسرة المنتجة</h3>
                <div className="social-links">
                  {p.socialLinks.map((s, i) => {
                    const url = safeUrl(s.url);
                    return url ? (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.platform} ↗
                      </a>
                    ) : null;
                  })}
                </div>
              </>
            )}
            {p.website && safeUrl(p.website) && (
              <p>
                <a
                  className="text-link"
                  href={safeUrl(p.website)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  الموقع الإلكتروني للأسرة المنتجة ↗
                </a>
              </p>
            )}
            <small>المراجعة الإدارية ليست ترخيصًا أو اعتمادًا حكوميًا.</small>
            <ReportButton producerId={p.id} />
          </aside>
        </div>
      </div>
    </FamilyViews>
  );
}
