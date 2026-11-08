import { MobileNavigation } from "@/components/public/mobile-navigation";
import { AboutTicker } from "@/components/public/about-ticker";
import "./fonts.css";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
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
      url: "/_next/image?url=%2Fbrand%2Faklaat-jdatna-logo.png&w=64&q=75",
    },
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
              src="/brand/aklaat-jdatna-logo.png"
              alt=""
              width={80}
              height={80}
              sizes="80px"
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
            <Link href="/login" className="button small">
              تسجيل الدخول
            </Link>
          </div>
          <MobileNavigation />
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="footer-top">
            <div>
              <Link className="footer-brand" href="/">
                <Image
                  className="footer-logo"
                  src="/brand/aklaat-jdatna-logo.png"
                  alt=""
                  width={96}
                  height={96}
                  sizes="96px"
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
              <Link href="/login">تسجيل الدخول</Link>
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
