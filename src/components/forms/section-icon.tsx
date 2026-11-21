/** أيقونات أقسام الإدارة ولوحة الأسرة المنتجة (زخرفية، مخفية عن القارئ الآلي). */
const icons: Record<string, string> = {
  // حقول النماذج: نموذج بخانات.
  fields: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h4",
  // تكاملات API: قابس.
  integrations: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  // سجل النشاطات: ورقة بسطور وساعة.
  activity: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h3",
  // ترتيب القوائم: بوصلة.
  menus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  // لوحة التحكم: أربعة مربعات.
  summary: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  // النسخ الاحتياطية: أسطوانة بيانات.
  backups:
    "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  // إثبات ملكية النطاق: درع وعلامة صح.
  verification:
    "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  producers: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  approvals:
    "M12 3a5 5 0 100 10 5 5 0 000-10zM8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5M9.8 8l1.6 1.6 2.9-3",
  orders: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  products: "M4 13a8 8 0 0016 0zM3 13h18M12 5v3M9 6v2M15 6v2",
  "deleted-chats": "M4 5h16v11H8l-4 4zM9 9l6 4M15 9l-6 4",
  views:
    "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  security: "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM9 12l2 2 4-4",
  contracts: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6M9.5 19h3.5",
  reports: "M5 21V4M5 4h11l-2 4 2 4H5",
  categories: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  locations:
    "M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  coverage: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  couriers:
    "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4",
  template: "M3 4h18v16H3zM3 9h18M9 9v11",
  texts: "M5 6h14M12 6v13M8 19h8",
  app: "M7 2h10v20H7zM11 18h2",
  review: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM8.5 12l2.5 2.5 4.5-5",
  suggestions:
    "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z",
  library:
    "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3",
  offers: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  members:
    "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 4a4 4 0 010 7M18 14a6 6 0 014 7",
};
export function SectionIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={icons[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
