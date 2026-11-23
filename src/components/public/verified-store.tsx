/**
 * شارة «متجر موثّق» ثابتة في زاوية الصفحة اليمنى السفلى (طلبات المالك 2026-11-23).
 *
 * - شهادة توثيق المتجر الإلكتروني من المركز السعودي للأعمال رقم 0000346762
 *   (سارية حتى 2027-01-09، ورابط المتجر المسجل فيها https://jdatna.com).
 * - الشكل كختم المنصة الرسمي (طلب المالك): كبسولة كحلية، وشعار المركز في مربع أبيض، و«متجر موثّق».
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
        {/* شعار المركز الرسمي كما في ختمه (EAuthSealApi/assets/sbc-emblem.svg)، في مربع أبيض. */}
        <span className="verified-store-chip" aria-hidden="true">
          {/* biome-ignore lint/performance/noImgElement: شعار SVG صغير ثابت */}
          <img src="/sbc-emblem.svg" alt="" width={20} height={22} />
        </span>
        <span className="verified-store-text">متجر موثّق</span>
      </a>
    </div>
  );
}
