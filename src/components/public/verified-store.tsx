/**
 * شارة «متجر موثّق» في التذييل (طلب المالك 2026-11-23): شهادة توثيق المتجر الإلكتروني من
 * المركز السعودي للأعمال رقم 0000346762 (سارية حتى 2027-01-09، تحقق منها 2026-11-23).
 * رابط تفاصيل الشهادة في المنصة يحتاج رمزًا مؤقتًا، فالشارة تفتح صفحة الاستعلام الرسمية
 * ورقم الشهادة مكتوب عليها ليُبحث به.
 */
export const VERIFICATION_NUMBER = "0000346762";
export const VERIFICATION_INQUIRY =
  "https://eauthenticate.saudibusiness.gov.sa/inquiry";

export function VerifiedStore() {
  return (
    <a
      className="verified-store"
      href={VERIFICATION_INQUIRY}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`متجر موثّق في المركز السعودي للأعمال، رقم الشهادة ${VERIFICATION_NUMBER}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        className="verified-store-icon"
      >
        <path
          fill="currentColor"
          d="M12 1.5l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 20.5l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"
        />
        <path
          fill="none"
          stroke="#1b2a5c"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.8 11.2l2.8 2.8 5.6-5.6"
        />
      </svg>
      <span className="verified-store-text">
        <strong>متجر موثّق</strong>
        <small dir="ltr">{VERIFICATION_NUMBER}</small>
      </span>
    </a>
  );
}
