import { ReportButton } from "@/components/public/report-button";
import { getPublicCoverage } from "@/server/coverage";
import { ShareButton } from "@/components/public/share-button";
import { ChatButton } from "@/components/forms/chat";
import { LocationCheck } from "@/components/maps/location-check";
import { RatingBox } from "@/components/forms/rating-box";
import { getSiteTexts } from "@/server/settings";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProducer, getProducerProducts } from "@/server/catalog";
import {
  ProductCard,
  EmptyState,
  phoneNumber,
  safeUrl,
  priceLabel,
} from "@/components/public/ui";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await getProducer((await params).slug);
  return { title: p?.name ?? "الأسرة المنتجة غير موجودة" };
}
export default async function ProducerDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await getProducer((await params).slug);
  if (!p) notFound();
  const [products, texts] = await Promise.all([
    getProducerProducts(p.id),
    getSiteTexts(),
  ]);
  const coverage = p.delivery ? await getPublicCoverage(p.id) : [];
  const phone = phoneNumber(p.phone);
  const whatsapp = p.whatsapp ? phoneNumber(p.whatsapp) : null;
  return (
    <div className="wrap page-space">
      <Link href="/producers" className="text-link">
        الأسر المنتجة ←
      </Link>
      <section className="profile-header">
        <div className="profile-symbol" aria-hidden="true">
          ⌂
        </div>
        <div>
          <p className="eyebrow">
            {p.regionName} · {p.cityName}
          </p>
          <h1>{p.name}</h1>
          {p.notCookingToday && (
            <p role="status" className="muted">
              لا يوجد طبخ اليوم. طلبات المواعيد القادمة متاحة بالاتفاق مع الأسرة
              المنتجة.
            </p>
          )}
          {p.verified && (
            <span className="badge inline">تمت مراجعتها إداريًا</span>
          )}
          <p className="profile-description">{p.description}</p>
        </div>
      </section>
      <div className="detail-grid">
        <section>
          <h2>من مائدة الأسرة المنتجة</h2>
          {products.length ? (
            <div className="product-grid two">
              {products.map((item) => (
                <ProductCard key={item.id} product={item} />
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
          <ShareButton title={p.name} />
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
                href={`https://wa.me/${whatsapp}`}
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
          <p className="muted">
            يُشارك موقع الاستلام الدقيق معك بالتنسيق الخاص؛ لا يُعرض عنوان
            المنزل علنًا.
          </p>
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
  );
}
