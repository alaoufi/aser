import Link from "next/link";
export default function NotFound() {
  return (
    <div className="state-page">
      <p className="eyebrow">٤٠٤ · الصفحة غير موجودة</p>
      <h1>يبدو أن الحكاية ليست هنا.</h1>
      <p>ربما تغير الرابط أو لم يعد المحتوى متاحًا للنشر.</p>
      <Link className="button" href="/browse">
        اكتشف الأكلات ←
      </Link>
      <Link className="text-link" href="/">
        العودة للرئيسية
      </Link>
    </div>
  );
}
