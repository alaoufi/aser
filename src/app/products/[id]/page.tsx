import { productStatusLabels } from "@/lib/site-texts";
import { ReportButton } from "@/components/public/report-button";
import { OrderRequestForm } from "@/components/forms/orders";
import { ChatButton } from "@/components/forms/chat";
import { LocationCheck } from "@/components/maps/location-check";
import { getSiteTexts } from "@/server/settings";
import { RatingBox } from "@/components/forms/rating-box";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProducer, getProduct } from "@/server/catalog";
import { phoneNumber, priceLabel, safeMediaUrl } from "@/components/public/ui";
import { JsonLd } from "@/components/public/json-ld";
import { ShareButton } from "@/components/public/share-button";
import { shortLink } from "@/server/share";
import { SITE_URL, absoluteUrl, excerpt, openGraph } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await getProduct((await params).id);
  if (!p) return { title: "المنتج غير موجود", robots: { index: false } };
  // العنوان والوصف بما يبحث به الناس: اسم الطبق + «أكل بيت» + الأسرة والمدينة.
  const title = `${p.name} من ${p.producerName} في ${p.cityName}`;
  const description = excerpt(
    `${p.name} أكل بيت من الأسرة المنتجة ${p.producerName} في ${p.cityName}` +
      (p.price !== null ? ` بسعر ${p.price} ريال لكل ${p.unit}` : "") +
      `. ${p.description}`,
  );
  const image = p.imageUrl && safeMediaUrl(p.imageUrl);
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.id}` },
    openGraph: openGraph({
      title,
      description,
      url: `/products/${p.id}`,
      ...(image ? { images: [{ url: image, alt: p.name }] } : {}),
    }),
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}
export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offer?: string | string[] }>;
}) {
  const [p, texts] = await Promise.all([
    getProduct((await params).id),
    getSiteTexts(),
  ]);
  if (!p) notFound();
  const offer = (await searchParams).offer;
  // وسائل تواصل الأسرة المنتجة المنشورة في صفحتها العامة فقط، لعرضها بعد إرسال الطلب.
  const [family, share] = await Promise.all([
    getProducer(p.producerSlug),
    shortLink("product", p.id),
  ]);
  const familyPhone = family?.phone ? phoneNumber(family.phone) : null;
  const familyWhatsapp = family?.whatsapp ? phoneNumber(family.whatsapp) : null;
  const image = p.imageUrl && safeMediaUrl(p.imageUrl);
  return (
    <div className="wrap page-space">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description: excerpt(p.description, 500) || p.name,
          url: absoluteUrl(`/products/${p.id}`),
          ...(image ? { image: absoluteUrl(image) } : {}),
          category: "أكلات شعبية سعودية",
          brand: { "@type": "Brand", name: p.producerName },
          ...(p.price !== null
            ? {
                offers: {
                  "@type": "Offer",
                  url: absoluteUrl(`/products/${p.id}`),
                  priceCurrency: "SAR",
                  price: p.price,
                  availability:
                    p.status === "available"
                      ? "https://schema.org/InStock"
                      : p.status === "preorder"
                        ? "https://schema.org/PreOrder"
                        : "https://schema.org/OutOfStock",
                  seller: {
                    "@type": "Organization",
                    name: p.producerName,
                    url: absoluteUrl(`/producers/${p.producerSlug}`),
                  },
                },
              }
            : {}),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "أكلات جدتنا",
              item: SITE_URL,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "طبخات اليوم",
              item: absoluteUrl("/browse"),
            },
            {
              "@type": "ListItem",
              position: 3,
              name: p.producerName,
              item: absoluteUrl(`/producers/${p.producerSlug}`),
            },
            { "@type": "ListItem", position: 4, name: p.name },
          ],
        }}
      />
      <div className="page-top">
        <Link href="/browse" className="text-link">
          طبخات اليوم ←
        </Link>
        <ShareButton
          title={p.name}
          url={share}
          text={`${p.name} من ${p.producerName}${p.price !== null ? ` — ${p.price} ر.س` : ""} في أكلات جدتنا`}
          image={image || null}
        />
      </div>
      <div className="product-detail">
        <div className="product-portrait">
          {p.imageUrl && safeMediaUrl(p.imageUrl) ? (
            <img src={p.imageUrl} alt={p.name} />
          ) : (
            <div className="portrait-placeholder">
              <span aria-hidden="true">♧</span>
              <p>لم تُضف صورة لهذا المنتج</p>
            </div>
          )}
        </div>
        <section>
          <p className="eyebrow">{p.cityName}</p>
          <span className="badge inline">
            {productStatusLabels(texts)[p.status]}
          </span>
          <h1>{p.name}</h1>
          {p.notCookingToday && (
            <p role="status" className="muted">
              لا يوجد طبخ اليوم لدى هذه الأسرة المنتجة. يمكنك طلب موعد يبدأ من
              الغد.
            </p>
          )}
          <Link className="text-link" href={`/producers/${p.producerSlug}`}>
            من مائدة {p.producerName} ←
          </Link>
          <p className="product-price">
            {priceLabel(p.price)}
            {p.price !== null && <small> / {p.unit}</small>}
          </p>
          <p className="profile-description">{p.description}</p>
          <div className="product-facts">
            <p>
              <strong>وحدة البيع</strong>
              <span>{p.unit}</span>
            </p>
            {p.preparationTime && (
              <p>
                <strong>وقت التجهيز</strong>
                <span>{p.preparationTime}</span>
              </p>
            )}
            <p>
              <strong>التوصيل</strong>
              <span>
                {p.deliveryScope === "kingdom"
                  ? texts["delivery.kingdom"] || "شحن لجميع مناطق المملكة"
                  : p.delivery
                    ? texts["delivery.coverage"] ||
                      "متاح بالتنسيق مع الأسرة المنتجة"
                    : "غير متاح"}
              </span>
            </p>
            <p>
              <strong>التسليم المباشر</strong>
              <span>{p.pickup ? "متاح من موقع الأسرة" : "غير متاح"}</span>
            </p>
            {p.deliveryScope === "kingdom" && (
              <p>
                <strong>الشحن</strong>
                <span>
                  {p.shippingFee == null
                    ? "رسوم الشحن بالاتفاق"
                    : `${p.shippingFee} ر.س`}
                  {texts["delivery.shippingAdded"]
                    ? ` — ${texts["delivery.shippingAdded"]}`
                    : ""}
                </span>
              </p>
            )}
          </div>
          {p.delivery && p.deliveryScope !== "kingdom" && (
            <LocationCheck producerSlug={p.producerSlug} />
          )}
          <RatingBox
            kind="product"
            target={p.id}
            title={texts["rating.product"] || "تقييم المنتج"}
            prompt={texts["rating.prompt"] || "رأيك مهم؟"}
          />
          {/* التواصل: المحادثة دائمًا، والواتساب والاتصال حسب اختيار الأسرة. */}
          <div className="contact-actions">
            <ChatButton producerSlug={p.producerSlug} />
            {familyWhatsapp && (
              <a
                href={`https://wa.me/${familyWhatsapp}?text=${encodeURIComponent(`السلام عليكم، أستفسر عن «${p.name}» في أكلات جدتنا`)}`}
                className="button secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                تواصل عبر واتساب ↗
              </a>
            )}
            {familyPhone && (
              <a href={`tel:+${familyPhone}`} className="button secondary">
                اتصل بالأسرة المنتجة
              </a>
            )}
          </div>
          <p className="muted">
            التواصل والاتفاق مباشرة مع الأسرة المنتجة. لا يوجد دفع إلكتروني داخل
            المنصة.
          </p>
        </section>
      </div>
      <ReportButton productId={p.id} />
      {p.status !== "unavailable" && (
        <OrderRequestForm
          productId={p.id}
          productName={p.name}
          unit={p.unit}
          price={p.price}
          producerName={p.producerName}
          producerSlug={p.producerSlug}
          contactPhone={familyPhone ?? undefined}
          contactWhatsapp={familyWhatsapp ?? undefined}
          notCookingToday={p.notCookingToday}
          fulfillmentOptions={{
            pickup: Boolean(p.pickup),
            delivery: p.delivery,
            deliveryScope: p.deliveryScope,
          }}
          offerId={Array.isArray(offer) ? "invalid" : offer}
          shipping={
            p.deliveryScope === "kingdom"
              ? {
                  label: texts["delivery.kingdom"] || "شحن لجميع مناطق المملكة",
                  fee: p.shippingFee ?? null,
                }
              : undefined
          }
        />
      )}
      <section className="food-information">
        <h2>اعرف أكثر قبل ما تختار</h2>
        <div className="information-grid">
          <div>
            <h3>المكونات</h3>
            <p>
              {p.ingredients || "لم تُذكر. استفسر من الأسرة المنتجة قبل الطلب."}
            </p>
          </div>
          <div>
            <h3>مسببات الحساسية</h3>
            <p>
              {p.allergens.length
                ? p.allergens.join("، ")
                : "لم تُذكر معلومات الحساسية. تحقق من الأسرة المنتجة، خصوصًا عند وجود حساسية غذائية."}
            </p>
          </div>
          <div>
            <h3>الحفظ والصلاحية</h3>
            <p>{p.storage || "استفسر عن شروط الحفظ من الأسرة المنتجة."}</p>
            {p.shelfLife && <p>الصلاحية: {p.shelfLife}</p>}
          </div>
        </div>
        {p.story && (
          <div className="food-story">
            <p className="eyebrow">وراء كل نكهة حكاية</p>
            <h2>حكاية الأكلة</h2>
            <p>{p.story}</p>
          </div>
        )}
      </section>
    </div>
  );
}
