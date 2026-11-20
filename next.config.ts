import type { NextConfig } from "next";
/**
 * سياسة المحتوى (CSP): كل شيء من الموقع نفسه، عدا بلاطات الخريطة من OpenStreetMap.
 * لا إطارات ولا كائنات ولا نماذج لمواقع أخرى، ولا يُضمَّن الموقع في موقع آخر.
 * 'unsafe-inline' للسكربت لازم لتهيئة Next.js المضمَّنة في الصفحة (لا رموز nonce هنا)؛
 * الحماية الأولى من XSS تبقى تهريب React للنصوص. في التطوير يُضاف eval وws لإعادة التحميل.
 */
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // الصور المصغّرة (/_next/image) تبقى في متصفح الزائر شهرًا بدل 4 ساعات: روابطها تتغير بتغيّر الملف.
  images: { minimumCacheTTL: 2678400 },
  async headers() {
    return [
      // ملفات public كانت تُرسل بـ max-age=0 فيسأل المتصفح عنها في كل صفحة. الخطوط لا تتغير (سنة)،
      // وصور الشعار والأطباق والدليل شهر، ويُستعمل المخزَّن أثناء التحقق في الخلفية بعده.
      {
        source: "/fonts/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:dir(brand|food|guide)/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=31536000",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // HTTPS دائمًا لسنة (دون النطاقات الفرعية، فهي خارج هذا الموقع).
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(self), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};
export default config;
