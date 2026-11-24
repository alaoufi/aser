import { MobileNavigation } from "@/components/public/mobile-navigation";
import { BottomNav } from "@/components/public/bottom-nav";
import { AboutTicker } from "@/components/public/about-ticker";
import { AccountLink } from "@/components/public/account-link";
import { OrderAlert } from "@/components/public/order-alert";
import { SiteOnly } from "@/components/public/site-only";
import { PushSetup } from "@/components/public/push-setup";
import { SaveToast } from "@/components/public/save-toast";
import { MessageAlert, MessagesLink } from "@/components/public/message-alert";
import { FamilyWelcome } from "@/components/public/family-welcome";
import { StarDefs } from "@/components/public/stars";
import { SITE_VERSION } from "@/lib/version";
import { FamilyStatusChip } from "@/components/forms/family-status";
import "./fonts.css";
import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import Link from "next/link";
import { cookies } from "next/headers";
import Image from "next/image";
import "./globals.css";
import "./heritage.css";
import "./najdi.css";
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  getAppLinks,
  getDomainVerifications,
  getSiteTexts,
  visitorTemplate,
} from "@/server/settings";
import { StoreBadges } from "@/components/public/store-badges";
import { NavProgress } from "@/components/public/nav-progress";
import { VerifiedStore } from "@/components/public/verified-store";
import { VerifiedStoreGate } from "@/components/public/verified-store-gate";
import { dishPath, findDish } from "@/lib/dishes";
import { TemplateSwitcher } from "@/components/public/template-switcher";
import { VisitStats } from "@/components/public/visit-stats";
import { JsonLd } from "@/components/public/json-ld";
import {
  POPULAR_SEARCHES,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
// القالب يُقرأ عند كل طلب حتى يسري اختيار الإدارة فورًا على كل الصفحات.
export const dynamic = "force-dynamic";
const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "أكلات جدتنا | من بيوت أهلنا",
    template: "%s | أكلات جدتنا",
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: SITE_NAME,
    title: "أكلات جدتنا | أكلات شعبية وطبخ بيت من الأسر المنتجة",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/brand/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "أكلات جدتنا — أكل شعبي سعودي من بيوت الأسر المنتجة",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "أكلات جدتنا | أكلات شعبية وطبخ بيت من الأسر المنتجة",
    description: SITE_DESCRIPTION,
    images: ["/brand/og-image.jpg"],
  },
  // رموز التحقق لـ Google Search Console وBing Webmaster من متغيرات الخادم (لا أسرار فيها).
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    // رمز Bing Webmaster لحساب المالك (عام بطبيعته، ويصلح لكل مواقع الحساب؛ متغير الخادم يغيّره إن لزم).
    other: {
      "msvalidate.01":
        process.env.BING_SITE_VERIFICATION ||
        "DD56AF86857C1DF8A258AB365A6A4C76",
    },
  },
  category: "food",
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
/**
 * رمز إثبات ملكية النطاق (المركز السعودي للأعمال) من «الإدارة ← إثبات ملكية النطاق»:
 * <meta name="domain-verification" content="…"> في <head> كل صفحة، ومنها الرئيسية.
 */
export async function generateMetadata(): Promise<Metadata> {
  const codes = await getDomainVerifications();
  if (!codes.length) return siteMetadata;
  return {
    ...siteMetadata,
    verification: {
      ...siteMetadata.verification,
      other: {
        ...siteMetadata.verification?.other,
        "domain-verification": codes,
      },
    },
  };
}
// viewportFit=cover: داخل تطبيق الآيفون تمتد الصفحة تحت شريط الساعة، فنحجز له مسافته (safe-area) في CSS.
export const viewport: Viewport = {
  themeColor: "#2e1d12",
  viewportFit: "cover",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // الخط العربي الأساسي يُطلب مع أول الصفحة، لا بعد قراءة ملف التنسيق، فيظهر النص بخطه أسرع.
  preload("/fonts/noto-sans-arabic-core.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  // زائر بلا جلسة: القائمة السفلية تُرسم في HTML الخادم فورًا بدل انتظار /api/session.
  const guest = !(await cookies()).has("jdatna_session");
  const [template, texts, appLinks, domainCodes] = await Promise.all([
    visitorTemplate(),
    getSiteTexts(),
    getAppLinks(),
    getDomainVerifications(),
  ]);
  return (
    <html
      lang="ar"
      dir="rtl"
      data-scroll-behavior="smooth"
      data-template={template}
    >
      {/*
        وسم إثبات الملكية حرفيًا كما تكتبه منصة المركز السعودي للأعمال، بلا «/» في آخره
        (Next.js يكتب وسوم metadata بـ «/>»، وقد يطابق فاحص المنصة النص حرفيًا).
        داخل noscript: الفاحصات التي لا تشغّل JavaScript تقرؤه وسمًا في <head>، والمتصفح يتجاهله.
        الرمز حروف وأرقام فقط (parseDomainVerification)، فلا يُحقن به شيء.
      */}
      {domainCodes.length > 0 && (
        <head>
          <noscript
            // biome-ignore lint/security/noDangerouslySetInnerHtml: الرموز مقيّدة بحروف وأرقام (getDomainVerifications)، والوسم يجب أن يُكتب حرفيًا
            dangerouslySetInnerHTML={{
              __html: domainCodes
                .map((c) => `<meta name="domain-verification" content="${c}">`)
                .join(""),
            }}
          />
        </head>
      )}
      <body>
        <StarDefs />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": SITE_URL + "/#organization",
                name: SITE_NAME,
                alternateName: ["Jdatna", "أكلات جدتنا"],
                url: SITE_URL,
                logo: SITE_URL + "/brand/app-icon-512.png",
                areaServed: {
                  "@type": "Country",
                  name: "المملكة العربية السعودية",
                },
              },
              {
                "@type": "WebSite",
                "@id": SITE_URL + "/#website",
                name: SITE_NAME,
                url: SITE_URL,
                inLanguage: "ar-SA",
                publisher: { "@id": SITE_URL + "/#organization" },
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: SITE_URL + "/browse?q={search_term_string}",
                  },
                  "query-input": "required name=search_term_string",
                },
              },
            ],
          }}
        />
        <a href="#main" className="skip-link">
          انتقل إلى المحتوى
        </a>
        <SiteOnly>
          {texts["ticker.text"] && <AboutTicker text={texts["ticker.text"]} />}
          <header className="site-header">
            <Link
              href="/"
              className="brand"
              aria-label="أكلات جدتنا — الرئيسية"
            >
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
              <Link href="/subscriptions">الاشتراكات</Link>
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
        </SiteOnly>
        <main id="main">{children}</main>
        <BottomNav guest={guest} />
        <NavProgress />
        <SaveToast />
        <SiteOnly>
          <FamilyWelcome texts={texts} />
          <OrderAlert />
          <MessageAlert />
          <VerifiedStoreGate>
            <VerifiedStore />
          </VerifiedStoreGate>
          <footer className="site-footer">
            <div className="footer-top">
              {/* اسم الموقع وتحته أزرار تحميل التطبيق، بلا شعار (شعار الترويسة يكفي) ولا فراغ. */}
              <div className="footer-brand-col">
                <Link className="footer-brand" href="/">
                  <span>أكلات جدتنا</span>
                </Link>
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
              </div>
              <div>
                <h3>اكتشف</h3>
                <Link href="/browse" prefetch={false}>
                  الأكلات والمنتجات
                </Link>
                <Link href="/producers" prefetch={false}>
                  الأسر المنتجة
                </Link>
                <Link href="/akalat" prefetch={false}>
                  الأكلات الشعبية
                </Link>
                <Link href="/offers" prefetch={false}>
                  العروض الخاصة
                </Link>
                <Link href="/subscriptions" prefetch={false}>
                  الاشتراكات
                </Link>
                <Link href="/orders" prefetch={false}>
                  طلباتي
                </Link>
              </div>
              <div>
                <h3>عن المنصة</h3>
                <Link href="/about" prefetch={false}>
                  حكايتنا
                </Link>
                <Link href="/guide" prefetch={false}>
                  دليل المستخدم
                </Link>
                <Link href="/privacy" prefetch={false}>
                  سياسة الخصوصية
                </Link>
                <Link href="/terms" prefetch={false}>
                  شروط الاستخدام
                </Link>
                <Link href="/support" prefetch={false}>
                  الدعم والتواصل
                </Link>
                <Link href="/suggestions" prefetch={false}>
                  الاقتراحات
                </Link>
              </div>
            </div>
            <nav className="footer-searches" aria-label="عمليات بحث شائعة">
              <h3>يبحث الناس عن</h3>
              <p>
                {/* كل كلمة تفتح صفحة أكلتها في الدليل (محتوى حقيقي)، وما لا صفحة له يفتح البحث. */}
                {POPULAR_SEARCHES.map((q) => {
                  const dish = findDish(q);
                  return (
                    <Link
                      key={q}
                      href={
                        dish
                          ? dishPath(dish)
                          : `/browse?q=${encodeURIComponent(q)}`
                      }
                      prefetch={false}
                    >
                      {q}
                    </Link>
                  );
                })}
                <Link href="/akalat" prefetch={false}>
                  كل الأكلات الشعبية
                </Link>
              </p>
            </nav>
            <VisitStats />
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
        </SiteOnly>
      </body>
    </html>
  );
}
