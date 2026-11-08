import { ReportButton } from "@/components/public/report-button";
import { OrderRequestForm } from "@/components/forms/orders";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProduct } from "@/server/catalog";
import { availability, priceLabel, safeMediaUrl } from "@/components/public/ui";
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
  return (
    <div className="wrap page-space">
      <Link href="/browse" className="text-link">
        اكتشف الأكلات ←
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
              لا يوجد طبخ اليوم لدى هذه الأسرة. يمكنك طلب موعد يبدأ من الغد.
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
              <span>{p.delivery ? "متاح بالتنسيق مع الأسرة" : "غير متاح"}</span>
            </p>
          </div>
          <Link className="button" href={`/producers/${p.producerSlug}`}>
            {p.price === null ? "استفسر عن السعر من الأسرة" : "تواصل مع الأسرة"}{" "}
            ←
          </Link>
          <p className="muted">
            التواصل والاتفاق مباشرة مع الأسرة. لا يوجد دفع إلكتروني داخل المنصة.
          </p>
        </section>
      </div>
      <ReportButton productId={p.id} />
      {p.status !== "unavailable" && (
        <OrderRequestForm
          productId={p.id}
          productName={p.name}
          notCookingToday={p.notCookingToday}
          offerId={Array.isArray(offer) ? "invalid" : offer}
        />
      )}
      <section className="food-information">
        <h2>اعرف أكثر قبل ما تختار</h2>
        <div className="information-grid">
          <div>
            <h3>المكونات</h3>
            <p>{p.ingredients || "لم تُذكر. استفسر من الأسرة قبل الطلب."}</p>
          </div>
          <div>
            <h3>مسببات الحساسية</h3>
            <p>
              {p.allergens.length
                ? p.allergens.join("، ")
                : "لم تُذكر معلومات الحساسية. تحقق من الأسرة، خصوصًا عند وجود حساسية غذائية."}
            </p>
          </div>
          <div>
            <h3>الحفظ والصلاحية</h3>
            <p>{p.storage || "استفسر عن شروط الحفظ من الأسرة."}</p>
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
