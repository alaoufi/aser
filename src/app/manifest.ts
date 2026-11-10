import type { MetadataRoute } from "next";

/** تعريف التطبيق: يُثبَّت الموقع على الجوال كتطبيق بأيقونة ويفتح بلا شريط المتصفح. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "أكلات جدتنا",
    short_name: "أكلات جدتنا",
    description:
      "طبخات تراثية ومنتجات غذائية من الأسر المنتجة السعودية، وتواصل مع الأسرة المنتجة مباشرة.",
    lang: "ar",
    dir: "rtl",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4ead9",
    theme_color: "#2e1d12",
    categories: ["food", "shopping", "lifestyle"],
    icons: [
      {
        src: "/brand/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "مائدة اليوم", url: "/table" },
      { name: "المحادثات", url: "/messages" },
      { name: "طلباتي", url: "/orders" },
    ],
  };
}
