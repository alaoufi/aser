import { ReportButton } from "@/components/public/report-button";
import { OrderRequestForm } from "@/components/forms/orders";
import { ChatButton } from "@/components/forms/chat";
import { LocationCheck } from "@/components/maps/location-check";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProducer, getProduct } from "@/server/catalog";
import {
  availability,
  phoneNumber,
  priceLabel,
  safeMediaUrl,
} from "@/components/public/ui";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await getProduct((await params).id);
  return { title: p?.name ?? "المنتج غير موجود" };
}
export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offer?: string | string[] }>;
}) {
  const p = await getProduct((await params).id);
  if (!p) notFound();
  const offer = (await searchParams).offer;
  // وسائل تواصل الأسرة المنتجة المنشورة في صفحتها العامة فقط، لعرضها بعد إرسال الطلب.
  const family = await getProducer(p.producerSlug);
  const familyPhone = family ? phoneNumber(family.phone) : null;
  const familyWhatsapp = family?.whatsapp ? phoneNumber(family.whatsapp) : null;
  return (
    <div className="wrap page-space">
      <Link href="/browse" className="text-link">
        طبخات اليوم ←
      </Link>
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
          <span className="badge inline">{availability[p.status]}</span>
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
                {p.delivery ? "متاح بالتنسيق مع الأسرة المنتجة" : "غير متاح"}
              </span>
            </p>
          </div>
          {p.delivery && <LocationCheck producerSlug={p.producerSlug} />}
          <ChatButton producerSlug={p.producerSlug} />
          <Link className="button" href={`/producers/${p.producerSlug}`}>
            {p.price === null
              ? "استفسر عن السعر من الأسرة المنتجة"
              : "تواصل مع الأسرة المنتجة"}{" "}
            ←
          </Link>
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
          offerId={Array.isArray(offer) ? "invalid" : offer}
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
