/** أيقونات أقسام الإدارة ولوحة الأسرة المنتجة (زخرفية، مخفية عن القارئ الآلي). */
const icons: Record<string, string> = {
  producers: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  orders: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  products: "M4 13a8 8 0 0016 0zM3 13h18M12 5v3M9 6v2M15 6v2",
  reports: "M5 21V4M5 4h11l-2 4 2 4H5",
  categories: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  locations:
    "M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  coverage: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  template: "M3 4h18v16H3zM3 9h18M9 9v11",
  texts: "M5 6h14M12 6v13M8 19h8",
  app: "M7 2h10v20H7zM11 18h2",
  review: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5zM8.5 12l2.5 2.5 4.5-5",
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
