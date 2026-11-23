"use client";
import { useEffect, useRef, useState } from "react";

/**
 * شارة «متجر موثّق» ثابتة في زاوية الصفحة اليمنى السفلى (طلب المالك 2026-11-23).
 *
 * - شهادة توثيق المتجر الإلكتروني من المركز السعودي للأعمال رقم 0000346762
 *   (سارية حتى 2027-01-09، ورابط المتجر المسجل فيها https://jdatna.com؛ تحقق منها 2026-11-23).
 * - الختم الرسمي: خدمة المركز `EAuthSealApi/seal` (نفسها التي يحمّلها seal.js) تُحمَّل في إطار مخفي.
 *   إن أرسلت مقاسه ظهر الختم الرسمي مكان شارتنا. وإن ردّت «أخفِ» (كما ترد حتى 2026-11-23) حُذف الإطار
 *   وبقيت شارتنا، وهي تفتح صفحة الاستعلام الرسمية ورقم الشهادة مكتوب عليها.
 * - لا نحمّل seal.js نفسه: يضع إطارًا شفافًا 120×44 فوق الصفحة ولو ردّت الخدمة «أخفِ».
 */
export const VERIFICATION_NUMBER = "0000346762";
export const VERIFICATION_INQUIRY =
  "https://eauthenticate.saudibusiness.gov.sa/inquiry";
const SEAL_BASE = "https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi";
/** رمز إثبات ملكية النطاق نفسه (المنشور في الصفحة) هو رمز الختم. */
const SEAL_TOKEN =
  "fe7d1c310cddeda07c92b84334ce1e570264715ccc2dc4621c5b348d2fd40926";

export function VerifiedStore() {
  const frame = useRef<HTMLIFrameElement>(null);
  // null: لم ترد الخدمة بعد. false: «أخفِ». {w,h}: الختم الرسمي ظاهر بمقاسه.
  const [seal, setSeal] = useState<null | false | { w: number; h: number }>(
    null,
  );
  // الإطار بعد ربط المستمع فقط، حتى لا يفوتنا رد المنصة قبل تهيئة الصفحة.
  const [listening, setListening] = useState(false);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as {
        sbcSeal?: boolean;
        remove?: boolean;
        width?: number;
        height?: number;
      };
      if (!d || d.sbcSeal !== true || e.source !== frame.current?.contentWindow)
        return;
      if (d.remove) setSeal(false);
      else if (d.width || d.height)
        setSeal((s) => ({
          w: Math.min(260, d.width || (s ? s.w : 120)),
          h: Math.min(120, d.height || (s ? s.h : 44)),
        }));
    };
    window.addEventListener("message", on);
    setListening(true);
    return () => window.removeEventListener("message", on);
  }, []);
  const official = Boolean(seal);
  return (
    <div className="verified-seal" data-official={official || undefined}>
      {listening && seal !== false && (
        <iframe
          ref={frame}
          className="verified-seal-frame"
          src={`${SEAL_BASE}/seal?token=${SEAL_TOKEN}&lang=ar&pos=bottom`}
          title="ختم التوثيق من المركز السعودي للأعمال"
          scrolling="no"
          style={
            seal
              ? { width: seal.w, height: seal.h }
              : { width: 0, height: 0, position: "absolute", opacity: 0 }
          }
        />
      )}
      {!official && (
        <a
          className="verified-store"
          href={VERIFICATION_INQUIRY}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`متجر موثّق في المركز السعودي للأعمال، رقم الشهادة ${VERIFICATION_NUMBER}`}
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
      )}
    </div>
  );
}
