import { MobileNavigation } from "@/components/public/mobile-navigation";
import { AboutTicker } from "@/components/public/about-ticker";
import { AccountLink } from "@/components/public/account-link";
import { OrderAlert } from "@/components/public/order-alert";
import { PushSetup } from "@/components/public/push-setup";
import { SaveToast } from "@/components/public/save-toast";
import { MessageAlert, MessagesLink } from "@/components/public/message-alert";
import { FamilyWelcome } from "@/components/public/family-welcome";
import { StarDefs } from "@/components/public/stars";
import { SITE_VERSION } from "@/lib/version";
import { FamilyStatusChip } from "@/components/forms/family-status";
import "./fonts.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import "./heritage.css";
import "./najdi.css";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  getAppLinks,
  getSiteTexts,
  visitorTemplate,
} from "@/server/settings";
import { StoreBadges } from "@/components/public/store-badges";
import { TemplateSwitcher } from "@/components/public/template-switcher";
// القالب يُقرأ عند كل طلب حتى يسري اختيار الإدارة فورًا على كل الصفحات.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL("https://jdatna.com"),
  title: {
    default: "أكلات جدتنا | من بيوت أهلنا",
    template: "%s | أكلات جدتنا",
  },
  description:
    "طبخات تراثية ومنتجات غذائية من الأسر المنتجة السعودية، وتواصل مع الأسرة المنتجة مباشرة.",
  applicationName: "أكلات جدتنا",
  icons: {
    icon: {
      url: "/brand/jdatna-icon.png",
      type: "image/png",
      sizes: "64x64",
    },
    apple: { url: "/brand/jdatna-apple-icon.png", sizes: "180x180" },
  },
  appleWebApp: {
    capable: true,
    title: "أكلات جدتنا",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = { themeColor: "#2e1d12" };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [template, texts, appLinks] = await Promise.all([
    visitorTemplate(),
    getSiteTexts(),
    getAppLinks(),
  ]);
  return (
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      data-template={template}
    >
      <body>
        <StarDefs />
        <a href="#main" className="skip-link">
          انتقل إلى المحتوى
        </a>
        {texts["ticker.text"] && <AboutTicker text={texts["ticker.text"]} />}
        <header className="site-header">
          <Link href="/" className="brand">
            <Image
              className="brand-logo"
              src="/brand/jdatna-symbol.webp"
              alt=""
              width={256}
              height={219}
              sizes="(max-width: 380px) 76px, (max-width: 850px) 84px, 112px"
              loading="eager"
            />
            <span>
              أكلات جدتنا
              {texts["brand.tagline"] && (
                <small>{texts["brand.tagline"]}</small>
              )}
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            <Link href="/">الرئيسية</Link>
            <Link href="/browse">طبخات اليوم</Link>
            <Link href="/producers">الأسر المنتجة</Link>
            <Link href="/offers">العروض الخاصة</Link>
            <Link href="/about">حكايتنا</Link>
          </nav>
          <div className="header-actions">
            <TemplateSwitcher current={template} className="desktop-only" />
            <FamilyStatusChip place="header" />
            <MessagesLink />
            <AccountLink className="button small" />
          </div>
          {/* المحادثات ظاهرة دائمًا على الجوال بجانب زر القائمة */}
          <MessagesLink className="mobile-messages" />
          <MobileNavigation
            switcher={<TemplateSwitcher current={template} />}
          />
        </header>
        <PushSetup
          texts={{
            title: texts["push.title"] || "فعّل الإشعارات",
            body: texts["push.body"],
            enable: texts["push.enable"] || "تفعيل الإشعارات",
            later: texts["push.later"] || "لاحقًا",
            ios: texts["push.ios"],
          }}
        />
        <main id="main">{children}</main>
        <FamilyWelcome texts={texts} />
        <OrderAlert />
        <MessageAlert />
        <SaveToast />
        <footer className="site-footer">
          <div className="footer-top">
            <div>
              <Link className="footer-brand" href="/">
                <Image
                  className="footer-logo"
                  src="/brand/jdatna-white.webp"
                  alt=""
                  width={320}
                  height={400}
                  sizes="112px"
                  loading="lazy"
                />
                <span>أكلات جدتنا</span>
              </Link>
            </div>
            <div>
              <h3>اكتشف</h3>
              <Link href="/browse">الأكلات والمنتجات</Link>
              <Link href="/producers">الأسر المنتجة</Link>
              <Link href="/offers">العروض الخاصة</Link>
              <Link href="/orders">طلباتي</Link>
            </div>
            <div>
              <h3>عن المنصة</h3>
              <Link href="/about">حكايتنا</Link>
              <Link href="/privacy">سياسة الخصوصية</Link>
              <Link href="/terms">شروط الاستخدام</Link>
              <Link href="/support">الدعم والتواصل</Link>
            </div>
          </div>
          <StoreBadges
            appStore={appLinks.showAppStore ? APP_STORE_URL : null}
            playStore={appLinks.showPlayStore ? PLAY_STORE_URL : null}
            texts={{
              title: texts["store.title"] || "حمّل تطبيق أكلات جدتنا",
              appStore: texts["store.appStore"] || "حمّل من App Store",
              googlePlay:
                texts["store.googlePlay"] || "احصل عليه من Google Play",
            }}
          />
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} أكلات جدتنا
              <small className="site-version">
                الإصدار <bdi dir="ltr">{SITE_VERSION}</bdi>
              </small>
              {texts["footer.affiliation"] && (
                <small className="footer-affiliation">
                  {texts["footer.affiliation"]}
                </small>
              )}
            </span>
            {texts["footer.made"] && (
              <span>
                {texts["footer.made"]} <span aria-hidden="true">✧</span>
              </span>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
