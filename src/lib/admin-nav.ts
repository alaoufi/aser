import type { AdminPermission } from "./permissions";

/**
 * قائمة «لوحة الإدارة» الجانبية، بصيغة المكتبة المشتركة (alaoufi/shared-library → code/menus، من «أي خدمة»):
 * مجموعات متقاربة بحسب نوع العمل، ولكل بند أيقونة ونص وصلاحية. البند الذي لا يحق للمدير الحالي يختفي،
 * والمدير الكامل يرى الكل. «owner» للمدير الكامل وحده، وnull لكل من له حساب إدارة.
 * افحصها بعد أي تعديل: node <shared-library>/tools/menu-lint.mjs src/lib/admin-nav.ts
 */
export type AdminNavItem = {
  to: string;
  /** اسم الأيقونة في section-icon.tsx (أيقونات SVG بخط الموقع، لا رموز تعبيرية). */
  icon: string;
  labelKey: string;
  perm: AdminPermission | "owner" | null;
  end?: boolean;
  /** بيانات القسم: تُحمَّل مسبقًا عند المرور على البند أو التركيز عليه، فيفتح بلا انتظار. */
  data?: string[];
};
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "نظرة عامة",
    items: [
      {
        to: "/admin",
        icon: "summary",
        labelKey: "لوحة التحكم",
        perm: null,
        end: true,
        data: ["/api/admin/summary"],
      },
      {
        to: "/admin/views",
        icon: "views",
        labelKey: "المشاهدات والزوار",
        perm: "content",
        data: ["/api/admin/views"],
      },
    ],
  },
  {
    // التقارير قرب الأعلى: الأمني، والنسخ الاحتياطية، وأي تقرير لاحق يضاف هنا.
    label: "التقارير",
    items: [
      {
        to: "/admin/security",
        icon: "security",
        labelKey: "التقرير الأمني",
        perm: "owner",
        data: ["/api/admin/security"],
      },
      {
        to: "/admin/backups",
        icon: "backups",
        labelKey: "النسخ الاحتياطية",
        perm: "owner",
        data: ["/api/admin/backups"],
      },
    ],
  },
  {
    // الناس: الأسر والمندوبون والأعضاء.
    label: "الأسر والأعضاء",
    items: [
      {
        to: "/admin/approvals",
        icon: "approvals",
        labelKey: "اعتماد الأسر والمندوبين",
        perm: "producers",
        data: ["/api/admin/producers"],
      },
      {
        to: "/admin/producers",
        icon: "producers",
        labelKey: "الأسر المنتجة",
        perm: "producers",
        data: ["/api/admin/producers"],
      },
      {
        to: "/admin/members",
        icon: "members",
        labelKey: "الأعضاء والصلاحيات",
        perm: "owner",
        data: ["/api/admin/members?q="],
      },
    ],
  },
  {
    // العمل بينهم: الطلبات وما يتبعها، ورسائل الأعضاء للإدارة.
    label: "الطلبات والمتابعة",
    items: [
      {
        to: "/admin/orders",
        icon: "orders",
        labelKey: "الطلبات",
        perm: "orders",
        data: ["/api/admin/orders"],
      },
      {
        to: "/admin/contracts",
        icon: "contracts",
        labelKey: "عقود الاشتراكات",
        perm: "orders",
        data: ["/api/admin/contracts"],
      },
      {
        to: "/admin/reports",
        icon: "reports",
        labelKey: "البلاغات",
        perm: "reports",
        data: ["/api/admin/reports"],
      },
      {
        to: "/admin/deleted-chats",
        icon: "deleted-chats",
        labelKey: "المحادثات المحذوفة",
        perm: "reports",
        data: ["/api/admin/conversations"],
      },
      {
        to: "/admin/suggestions",
        icon: "suggestions",
        labelKey: "الاقتراحات",
        perm: "owner",
        data: ["/api/admin/suggestions"],
      },
    ],
  },
  {
    // ما يُقدَّم: المنتجات وأقسامها.
    label: "المنتجات والأقسام",
    items: [
      {
        to: "/admin/products",
        icon: "products",
        labelKey: "المنتجات",
        perm: "products",
        data: ["/api/admin/products", "/api/admin/categories"],
      },
      {
        to: "/admin/categories",
        icon: "categories",
        labelKey: "إدارة الأقسام",
        perm: "categories",
        data: ["/api/admin/categories", "/api/admin/product-fields"],
      },
    ],
  },
  {
    label: "الأماكن",
    items: [
      {
        to: "/admin/locations",
        icon: "locations",
        labelKey: "المواقع",
        perm: "locations",
        data: ["/api/admin/locations"],
      },
      {
        to: "/admin/coverage",
        icon: "coverage",
        labelKey: "التغطية التفصيلية",
        perm: "locations",
        data: ["/api/admin/coverage"],
      },
    ],
  },
  {
    label: "إعدادات الموقع",
    items: [
      {
        to: "/admin/template",
        icon: "template",
        labelKey: "قالب الموقع",
        perm: "content",
        data: ["/api/admin/settings"],
      },
      {
        to: "/admin/texts",
        icon: "texts",
        labelKey: "نصوص الموقع",
        perm: "content",
        data: ["/api/admin/texts"],
      },
      {
        to: "/admin/app",
        icon: "app",
        labelKey: "تطبيق الجوال",
        perm: "content",
        data: ["/api/admin/app-links"],
      },
      {
        to: "/admin/review",
        icon: "review",
        labelKey: "مراجعة المتاجر",
        perm: "owner",
        data: ["/api/admin/store-review"],
      },
      {
        to: "/admin/verification",
        icon: "verification",
        labelKey: "إثبات ملكية النطاق",
        perm: "owner",
        data: ["/api/admin/verification"],
      },
    ],
  },
];

type Who = { role: string; permissions?: string[] | null } | null | undefined;
/** هل يرى هذا المدير البند؟ المدير الكامل يرى الكل. */
export function allowedItem(user: Who, item: AdminNavItem) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (item.perm === "owner") return false;
  return item.perm === null
    ? Boolean(user.permissions?.length)
    : Boolean(user.permissions?.includes(item.perm));
}
/** المجموعات بما يحق له فقط؛ المجموعة الفارغة لا تظهر. */
export function visibleGroups(user: Who) {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => allowedItem(user, it)),
  })).filter((g) => g.items.length > 0);
}
/** القسم من المسار: /admin/orders ← orders، و/admin ← null (لوحة التحكم). */
export function sectionOf(path: string) {
  const m = /^\/admin\/([a-z-]+)/.exec(path);
  return m ? m[1] : null;
}
/** عنوان الصفحة الحالية في رأس اللوحة. */
export function currentLabel(path: string) {
  let best: AdminNavItem | null = null;
  for (const g of NAV_GROUPS)
    for (const it of g.items)
      if (
        (it.end
          ? path === it.to
          : path === it.to || path.startsWith(it.to + "/")) &&
        (!best || it.to.length > best.to.length)
      )
        best = it;
  return best?.labelKey ?? "لوحة الإدارة";
}
