import { MobileNavigation } from "@/components/public/mobile-navigation";
import "./fonts.css";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://jdatna.com"),
  title: {
    default: "أكلات وغذاء الأجداد | من بيوت أهلنا",
    template: "%s | أكلات وغذاء الأجداد",
  },
  description:
    "اكتشف الأكلات التراثية والمنتجات الغذائية من الأسر المنتجة السعودية، وتواصل مع الأسرة مباشرة.",
  applicationName: "أكلات وغذاء الأجداد",
  icons: { icon: { url: "/brand/jdatna-logo.jpeg", type: "image/jpeg" } },
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
        <div className="announcement">
          من بيوت أهلنا، وبطعم تراثنا <span>✦</span> منصة للأسر المنتجة الغذائية
        </div>
        <header className="site-header">
          <Link href="/" className="brand">
            <img
              className="brand-logo"
              src="/brand/jdatna-logo.jpeg"
              alt=""
              width={80}
              height={80}
            />
            <span>
              أكلات وغذاء الأجداد<small>أصالة تُصنع بحب</small>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            <Link href="/">الرئيسية</Link>
            <Link href="/browse">اكتشف الأكلات</Link>
            <Link href="/producers">الأسر المنتجة</Link>
            <Link href="/about">حكايتنا</Link>
          </nav>
          <div className="header-actions">
            <Link href="/login" className="account-link">
              دخول
            </Link>
            <Link href="/register" className="button small">
              سجّل كأسرة منتجة <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <MobileNavigation />
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="footer-top">
            <div>
              <Link className="footer-brand" href="/">
                <img
                  className="footer-logo"
                  src="/brand/jdatna-logo.jpeg"
                  alt=""
                  width={96}
                  height={96}
                  loading="lazy"
                />
                <span>أكلات وغذاء الأجداد</span>
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
              <Link href="/register">انضم كأسرة منتجة</Link>
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
              © {new Date().getFullYear()} أكلات وغذاء الأجداد
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
