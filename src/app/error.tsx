"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="state-page">
      <p className="eyebrow">تعذّر تحميل الصفحة</p>
      <h1>نحتاج محاولة أخرى.</h1>
      <p>حدث خلل أثناء جلب المحتوى. أعد المحاولة بعد قليل.</p>
      <button className="button" onClick={reset}>
        إعادة المحاولة
      </button>
      <a className="text-link" href="/">
        العودة للرئيسية
      </a>
    </div>
  );
}
