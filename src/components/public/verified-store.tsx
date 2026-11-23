"use client";
import { forwardRef, useEffect, useRef, useState } from "react";

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
  // الإطار بعد ربط المستمع، وبعد اكتمال الصفحة بأربع ثوانٍ.
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
    // الختم من موقع خارجي: يُحمَّل بعد اكتمال الصفحة وهدوئها، فلا يؤخر تحميلها ولا يُبقيها «تحمّل».
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => setListening(true), 4000);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("message", on);
      window.removeEventListener("load", start);
      window.clearTimeout(timer);
    };
  }, []);
  const official = Boolean(seal);
  const dialog = useRef<HTMLDialogElement>(null);
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
        <button
          type="button"
          className="verified-store"
          aria-haspopup="dialog"
          aria-label={`متجر موثّق في المركز السعودي للأعمال، رقم الشهادة ${VERIFICATION_NUMBER}`}
          onClick={() => dialog.current?.showModal()}
        >
          <SealIcon />
          <span className="verified-store-text">
            <strong>متجر موثّق</strong>
            <small dir="ltr">{VERIFICATION_NUMBER}</small>
          </span>
        </button>
      )}
      <CertificateDialog ref={dialog} />
    </div>
  );
}

/**
 * بيانات الشهادة كما في منصة المركز السعودي للأعمال (تحقق منها 2026-11-23). المنصة تحمي بياناتها
 * باختبار تحقق آلي، فلا تُجلب تلقائيًا: تُعرض هنا ثابتة، وزر «تحقق في المنصة» ينسخ الرقم ويفتح الاستعلام الرسمي.
 */
export const CERTIFICATE = {
  storeName: "جدتنا – jdatna",
  storeUrl: "https://jdatna.com",
  linkedTo: "سجل تجاري",
  expires: "2027-01-09",
  checkedAt: "2026-11-23",
};
const day = (iso: string) => iso.split("-").reverse().join("/");

function SealIcon() {
  return (
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
  );
}

const CertificateDialog = forwardRef<HTMLDialogElement>(
  function CertificateDialog(_, ref) {
    const [copied, setCopied] = useState(false);
    const valid =
      new Date() < new Date(`${CERTIFICATE.expires}T23:59:59+03:00`);
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: الضغط على الخلفية للفأرة واللمس فقط؛ لوحة المفاتيح تغلق بـ Esc وزر «إغلاق»
      <dialog
        ref={ref}
        className="certificate-dialog"
        aria-labelledby="certificate-title"
        onClick={(e) => {
          // الضغط خارج البطاقة يغلقها.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="certificate-card">
          <button
            type="button"
            className="certificate-close"
            aria-label="إغلاق"
            onClick={(e) =>
              (e.currentTarget.closest("dialog") as HTMLDialogElement).close()
            }
          >
            ✕
          </button>
          <SealIcon />
          <h2 id="certificate-title">متجر موثّق</h2>
          <p className="certificate-sub">
            شهادة توثيق المتجر الإلكتروني من المركز السعودي للأعمال
          </p>
          <dl className="certificate-data">
            <div>
              <dt>اسم المتجر</dt>
              <dd>{CERTIFICATE.storeName}</dd>
            </div>
            <div>
              <dt>رقم شهادة التوثيق</dt>
              <dd dir="ltr">{VERIFICATION_NUMBER}</dd>
            </div>
            <div>
              <dt>حالة الشهادة</dt>
              <dd>
                <span
                  className="certificate-status"
                  data-valid={valid || undefined}
                >
                  {valid ? "سارية" : "انتهت — تحقق من المنصة"}
                </span>
              </dd>
            </div>
            <div>
              <dt>تاريخ انتهاء الصلاحية</dt>
              <dd dir="ltr">{day(CERTIFICATE.expires)}</dd>
            </div>
            <div>
              <dt>رابط المتجر المسجل</dt>
              <dd dir="ltr">{CERTIFICATE.storeUrl}</dd>
            </div>
            <div>
              <dt>ارتباط الشهادة</dt>
              <dd>{CERTIFICATE.linkedTo}</dd>
            </div>
          </dl>
          <a
            className="certificate-verify"
            href={VERIFICATION_INQUIRY}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              navigator.clipboard
                ?.writeText(VERIFICATION_NUMBER)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            تحقق في منصة المركز السعودي للأعمال
          </a>
          <p className="certificate-hint" aria-live="polite">
            {copied
              ? "نُسخ رقم الشهادة ✓ الصقه في خانة البحث في المنصة."
              : "يُنسخ رقم الشهادة عند الضغط، فالصقه في خانة البحث في المنصة."}
          </p>
          <p className="certificate-checked">
            آخر تحقق من بيانات المنصة:{" "}
            <span dir="ltr">{day(CERTIFICATE.checkedAt)}</span>
          </p>
        </div>
      </dialog>
    );
  },
);
