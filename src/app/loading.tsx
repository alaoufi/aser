export default function Loading() {
  return (
    <div className="wrap page-space" role="status" aria-live="polite">
      <p className="eyebrow">لحظات ونقرّب لك النكهات…</p>
      <div className="loading-skeleton" />
      <span>جارٍ تحميل المحتوى</span>
    </div>
  );
}
