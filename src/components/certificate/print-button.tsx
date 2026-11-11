"use client";
/** حفظ الشهادة PDF أو طباعتها من نافذة الطباعة في المتصفح. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
