"use client";
import { useState } from "react";

const e = encodeURIComponent;
const svg = (children: React.ReactNode) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
/** أيقونات خطية بسيطة بلون كل تطبيق. */
const icons = {
  share: svg(
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>,
  ),
  chat: svg(<path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 8 20.2z" />),
  send: svg(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />),
  facebook: svg(
    <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" />,
  ),
  x: svg(<path d="M4 4l16 16M20 4 4 20" />),
  tiktok: svg(
    <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6" />,
  ),
  camera: svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>,
  ),
  ghost: svg(
    <path d="M12 3c3.3 0 5.5 2.4 5.5 5.6v2.6l2 1-2 .9c.5 1.6 1.7 2.6 3 3-1.6.9-3.2.7-4 1.6-.8.9-1.8 1.8-4.5 1.8s-3.7-.9-4.5-1.8c-.8-.9-2.4-.7-4-1.6 1.3-.4 2.5-1.4 3-3l-2-.9 2-1V8.6C6.5 5.4 8.7 3 12 3z" />,
  ),
  link: svg(
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  ),
  qr: svg(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M17 20h.01M20 17v4h-3" />
    </>,
  ),
};

/**
 * «مشاركة»: أيقونة وكلمة تفتح قائمة تتمدد وتنكمش بكل طرق المشاركة:
 * الصورة مع الرابط (قائمة الجوال)، وواتساب وتيليجرام وفيسبوك وتويتر مباشرة،
 * وتيك توك وإنستغرام وسناب بنسخ الرابط وفتح قائمة الجوال، ونسخ الرابط، ورمز QR.
 */
export function ShareButton({
  title,
  url,
  text,
  image,
}: {
  title: string;
  /** الرابط المختصر؛ بدونه يُشارك رابط الصفحة الحالية. */
  url?: string | null;
  /** نص الرسالة مع الرابط. */
  text?: string;
  /** صورة المنتج أو شعار الأسرة، تُرسل مع الرابط عند «مشاركة (صورة + رابط)». */
  image?: string | null;
  /** للتوافق مع الاستخدام السابق. */
  label?: string;
}) {
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState(false);
  const link = () => url || window.location.href;
  const body = text ?? title;
  const code = url?.split("/s/")[1];
  async function copy(app?: string) {
    try {
      await navigator.clipboard.writeText(link());
      setMessage(app ? `تم نسخ الرابط ✓ الصقه في ${app}` : "تم نسخ الرابط ✓");
    } catch {
      setMessage("اضغط مطولًا على الرابط لنسخه");
    }
  }
  /** قائمة مشاركة الجوال (فيها كل التطبيقات المثبتة)، مع الصورة إن أمكن. */
  async function device(withImage: boolean) {
    if (!navigator.share) return false;
    const data: ShareData = { title, text: `${body}\n${link()}`, url: link() };
    if (withImage && image) {
      try {
        const blob = await (await fetch(image)).blob();
        const file = new File([blob], "jdatna.jpg", {
          type: blob.type || "image/jpeg",
        });
        if (navigator.canShare?.({ files: [file] })) data.files = [file];
      } catch {
        /* بلا صورة: الرابط وحده */
      }
    }
    try {
      await navigator.share(data);
    } catch {
      /* أُلغيت القائمة */
    }
    return true;
  }
  async function viaApp(app: string) {
    await copy(app);
    await device(false);
  }
  const direct: {
    name: string;
    icon: React.ReactNode;
    color: string;
    href: (u: string) => string;
  }[] = [
    {
      name: "واتساب",
      icon: icons.chat,
      color: "#1fa855",
      href: (u) => `https://wa.me/?text=${e(`${body}\n${u}`)}`,
    },
    {
      name: "تيليجرام",
      icon: icons.send,
      color: "#229ed9",
      href: (u) => `https://t.me/share/url?url=${e(u)}&text=${e(body)}`,
    },
    {
      name: "فيسبوك",
      icon: icons.facebook,
      color: "#1877f2",
      href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}`,
    },
    {
      name: "تويتر / X",
      icon: icons.x,
      color: "#111111",
      href: (u) =>
        `https://twitter.com/intent/tweet?url=${e(u)}&text=${e(body)}`,
    },
    {
      name: "سناب شات",
      icon: icons.ghost,
      color: "#c9a800",
      href: (u) => `https://www.snapchat.com/scan?attachmentUrl=${e(u)}`,
    },
  ];
  const viaDevice = [
    { name: "تيك توك", icon: icons.tiktok, color: "#111111" },
    { name: "إنستغرام", icon: icons.camera, color: "#d6249f" },
  ];
  return (
    <details className="share-menu">
      <summary>
        {icons.share}
        <span>مشاركة</span>
      </summary>
      <div className="share-panel">
        <ul aria-label="المشاركة عبر">
          <li>
            <button
              type="button"
              onClick={async () => {
                if (!(await device(true))) await copy();
              }}
            >
              <span style={{ color: "#2e1d12" }}>{icons.share}</span>
              مشاركة (صورة + رابط)
            </button>
          </li>
          {direct.map((t) => (
            <li key={t.name}>
              <a
                href={t.href(url ?? "")}
                onClick={(ev) => {
                  if (!url) ev.currentTarget.href = t.href(link());
                }}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span style={{ color: t.color }}>{t.icon}</span>
                {t.name}
              </a>
            </li>
          ))}
          {viaDevice.map((t) => (
            <li key={t.name}>
              <button type="button" onClick={() => viaApp(t.name)}>
                <span style={{ color: t.color }}>{t.icon}</span>
                {t.name} <small className="muted">(يُنسخ الرابط)</small>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => copy()}>
              <span style={{ color: "#9c2f1e" }}>{icons.link}</span>
              نسخ الرابط
            </button>
          </li>
          {code && (
            <li>
              <button
                type="button"
                aria-expanded={qr}
                onClick={() => setQr(!qr)}
              >
                <span style={{ color: "#2e1d12" }}>{icons.qr}</span>
                رمز QR
              </button>
            </li>
          )}
        </ul>
        {qr && code && (
          <a
            className="share-qr"
            href={`/s/${code}/qr`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* biome-ignore lint/performance/noImgElement: صورة SVG صغيرة يولّدها الخادم للرمز */}
            <img
              src={`/s/${code}/qr`}
              alt="رمز QR لرابط المشاركة"
              width={180}
              height={180}
            />
          </a>
        )}
        {url && (
          <bdi dir="ltr" className="share-link">
            {url.replace(/^https:\/\//, "")}
          </bdi>
        )}
        <span role="status" aria-live="polite" className="muted">
          {message}
        </span>
      </div>
    </details>
  );
}
