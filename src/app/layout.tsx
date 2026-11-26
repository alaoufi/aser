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
import "./palettes.css";
import "./family-table.css";
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
import { SiteTextsProvider, T } from "@/components/site-texts";
import {
  AppearancePicker,
  PALETTE_SCRIPT,
} from "@/components/public/appearance-picker";
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
      // data-palette يضعه سكربت «ألوان الموقع» قبل التحميل من اختيار الزائر في جهازه.
      suppressHydrationWarning
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
        {/* لون الزائر قبل رسم الصفحة (نص ثابت من الكود، لا مدخلات). */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: نص ثابت من الكود يقرأ اختيار الزائر من جهازه
          dangerouslySetInnerHTML={{ __html: PALETTE_SCRIPT }}
        />
        <SiteTextsProvider texts={texts}>
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
            <T k="p.layout.t1" />
          </a>
          <SiteOnly>
            {texts["ticker.text"] && (
              <AboutTicker text={texts["ticker.text"]} />
            )}
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
                <Link href="/">
                  <T k="p.layout.t2" />
                </Link>
                <Link href="/browse">
                  <T k="p.layout.t3" />
                </Link>
                <Link href="/producers">
                  <T k="p.layout.t4" />
                </Link>
                <Link href="/offers">
                  <T k="p.layout.t5" />
                </Link>
                <Link href="/subscriptions">
                  <T k="p.layout.t6" />
                </Link>
                <Link href="/about">
                  <T k="p.layout.t7" />
                </Link>
              </nav>
              <AppearancePicker
                texts={{
                  button: texts["palette.button"] || "ألوان الموقع",
                  title: texts["palette.title"] || "ألوان الموقع",
                  note: texts["palette.note"],
                  sadu: texts["palette.sadu"] || "السدو",
                  nakheel: texts["palette.nakheel"] || "النخيل",
                  teen: texts["palette.teen"] || "الطين",
                  qahwa: texts["palette.qahwa"] || "القهوة والهيل",
                  zafaran: texts["palette.zafaran"] || "الزعفران",
                  neel: texts["palette.neel"] || "النيلة",
                }}
              />
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
                    <span>
                      <T k="p.layout.t8" />
                    </span>
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
                  <h3>
                    <T k="p.layout.t9" />
                  </h3>
                  <Link href="/browse" prefetch={false}>
                    <T k="p.layout.t10" />
                  </Link>
                  <Link href="/producers" prefetch={false}>
                    <T k="p.layout.t4" />
                  </Link>
                  <Link href="/akalat" prefetch={false}>
                    <T k="p.layout.t11" />
                  </Link>
                  <Link href="/offers" prefetch={false}>
                    <T k="p.layout.t5" />
                  </Link>
                  <Link href="/subscriptions" prefetch={false}>
                    <T k="p.layout.t6" />
                  </Link>
                  <Link href="/orders" prefetch={false}>
                    <T k="p.layout.t12" />
                  </Link>
                </div>
                <div>
                  <h3>
                    <T k="p.layout.t13" />
                  </h3>
                  <Link href="/about" prefetch={false}>
                    <T k="p.layout.t7" />
                  </Link>
                  <Link href="/guide" prefetch={false}>
                    <T k="p.layout.t14" />
                  </Link>
                  <Link href="/privacy" prefetch={false}>
                    <T k="p.layout.t15" />
                  </Link>
                  <Link href="/terms" prefetch={false}>
                    <T k="p.layout.t16" />
                  </Link>
                  <Link href="/support" prefetch={false}>
                    <T k="p.layout.t17" />
                  </Link>
                  <Link href="/suggestions" prefetch={false}>
                    <T k="p.layout.t18" />
                  </Link>
                </div>
              </div>
              <nav className="footer-searches" aria-label="عمليات بحث شائعة">
                <h3>
                  <T k="p.layout.t19" />
                </h3>
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
                    <T k="p.layout.t20" />
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
        </SiteTextsProvider>
      </body>
    </html>
  );
}
