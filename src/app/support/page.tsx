import Link from "next/link";
import { getSiteTexts } from "@/server/settings";

export const metadata = {
  title: "الدعم والتواصل",
  description: "كيف تتواصل مع أكلات جدتنا، وتبلغ عن محتوى، وتحذف حسابك.",
};

/** صفحة الدعم: رابط الدعم المطلوب في متجري آبل وقوقل. */
export default async function SupportPage() {
  const t = await getSiteTexts();
  return (
    <article className="wrap prose page-space">
      <h1>الدعم والتواصل</h1>
      {t["support.contact"] ? (
        <p>
          <strong>للتواصل مع إدارة المنصة:</strong>{" "}
          <bdi>{t["support.contact"]}</bdi>
        </p>
      ) : null}
      {t["support.hours"] && <p>{t["support.hours"]}</p>}
      <h2>بخصوص طلب أو منتج</h2>
      <p>
        الاتفاق على التفاصيل والسعر والاستلام يتم مع الأسرة المنتجة مباشرة. افتح
        «المحادثات» من أعلى الموقع، أو اضغط «مراسلة» من طلبك في{" "}
        <Link href="/orders">طلباتي</Link>.
      </p>
      <h2>الإبلاغ عن محتوى أو مستخدم</h2>
      <ul>
        <li>
          من صفحة المنتج أو الأسرة المنتجة: زر «إبلاغ» يصل للإدارة لمراجعته.
        </li>
        <li>
          من المحادثة: زر الخيارات ⋮ ثم «إبلاغ عن المحادثة»، ويمكنك «حظر
          المحادثة» فلا يستطيع أي طرف الإرسال فيها.
        </li>
      </ul>
      <h2>حسابك وبياناتك</h2>
      <p>
        يمكنك حذف حسابك وبياناتك الشخصية بنفسك في أي وقت من{" "}
        <Link href="/account/delete">حذف الحساب</Link>. واطلع على{" "}
        <Link href="/privacy">سياسة الخصوصية</Link> و
        <Link href="/terms">شروط الاستخدام</Link>.
      </p>
    </article>
  );
}
