/**
 * شارة «متجر موثّق» ثابتة في زاوية الصفحة اليمنى السفلى (طلبات المالك 2026-11-23).
 *
 * - شهادة توثيق المتجر الإلكتروني من المركز السعودي للأعمال رقم 0000346762
 *   (سارية حتى 2027-01-09، ورابط المتجر المسجل فيها https://jdatna.com).
 * - الضغط يفتح بيانات الشهادة في منصة المركز **مباشرة**: الرابط /verified يجلب رابط «عرض التحقق»
 *   من خدمة الختم الرسمية (src/server/verified-seal.ts) ويحوّل إليه. ختم المنصة المضمَّن كان يعرض
 *   نافذة الرمز أولًا ثم «عرض التحقق»، والمالك أراد البيانات مباشرة.
 */
import { VERIFICATION_NUMBER } from "@/server/verified-seal";

export function VerifiedStore() {
  return (
    <div className="verified-seal">
      <a
        className="verified-store"
        href="/verified"
        target="_blank"
        rel="noopener"
        aria-label={`متجر موثّق في المركز السعودي للأعمال، رقم الشهادة ${VERIFICATION_NUMBER}: عرض بيانات الشهادة`}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
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
    </div>
  );
}
