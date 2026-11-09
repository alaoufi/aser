import { MobileNavigation } from "@/components/public/mobile-navigation";
import { AboutTicker } from "@/components/public/about-ticker";
import { AccountLink } from "@/components/public/account-link";
import { OrderAlert } from "@/components/public/order-alert";
import { FamilyStatusChip } from "@/components/forms/family-status";
import "./fonts.css";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import "./heritage.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://jdatna.com"),
  title: {
    default: "أكلات جدتنا | من بيوت أهلنا",
    template: "%s | أكلات جدتنا",
  },
  description:
    "اكتشف الأكلات التراثية والمنتجات الغذائية من الأسر المنتجة السعودية، وتواصل مع الأسرة مباشرة.",
  applicationName: "أكلات جدتنا",
  icons: {
    icon: {
      url: "/brand/jdatna-icon.png",
      type: "image/png",
      sizes: "64x64",
    },
    apple: { url: "/brand/jdatna-apple-icon.png", sizes: "180x180" },
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth">
      <body>
        <a href="#main" className="skip-link">
          انتقل إلى المحتوى
        </a>
        <AboutTicker />
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
              أكلات جدتنا<small>أصالة تُصنع بحب</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            <Link href="/">الرئيسية</Link>
            <Link href="/browse">اكتشف الأكلات</Link>
            <Link href="/producers">الأسر المنتجة</Link>
            <Link href="/offers">العروض الخاصة</Link>
            <Link href="/about">حكايتنا</Link>
          </nav>
          <div className="header-actions">
            <FamilyStatusChip place="header" />
            <AccountLink className="button small" />
          </div>
          <MobileNavigation />
        </header>
        <main id="main">{children}</main>
        <OrderAlert />
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
              <p>
                نكهات تحكي حكايتنا، وأيادٍ تحفظ موروثنا.
                <br />
                مساحة تجمع الأسر المنتجة ومحبي الأكل الأصيل.
              </p>
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
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} أكلات جدتنا
              <small className="footer-affiliation">أحد فروع مواقع تربح</small>
            </span>
            <span>
              صُنع ليقرّب أهل الدار <span aria-hidden="true">✧</span>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
