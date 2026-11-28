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
        perm: "views",
        data: ["/api/admin/views"],
      },
      {
        // «الإعلانات الترويجية» (من «أي خدمة»): مع المشاهدات، فالتسويق في مكان واحد.
        to: "/admin/ads",
        icon: "ads",
        labelKey: "الإعلانات الترويجية",
        perm: "ads",
        data: ["/api/admin/ads"],
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
        perm: "security",
        data: ["/api/admin/security"],
      },
      {
        to: "/admin/backups",
        icon: "backups",
        labelKey: "النسخ الاحتياطية",
        perm: "backups",
        data: ["/api/admin/backups"],
      },
      {
        to: "/admin/activity",
        icon: "activity",
        labelKey: "سجل النشاطات",
        perm: "activity",
        data: ["/api/admin/activity?group=&q="],
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
        labelKey: "اعتماد المندوبين",
        perm: "approvals",
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
        perm: "contracts",
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
        perm: "deleted-chats",
        data: ["/api/admin/conversations"],
      },
      {
        to: "/admin/suggestions",
        icon: "suggestions",
        labelKey: "الاقتراحات",
        perm: "suggestions",
        data: ["/api/admin/suggestions"],
      },
      {
        to: "/admin/invites",
        icon: "invites",
        labelKey: "دعوات الأصدقاء",
        perm: "invites",
        data: ["/api/admin/invites"],
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
        perm: "coverage",
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
        perm: "template",
        data: ["/api/admin/settings"],
      },
      {
        to: "/admin/texts",
        icon: "texts",
        labelKey: "نصوص الموقع",
        perm: "texts",
        data: ["/api/admin/texts"],
      },
      {
        // «حقول النماذج» بندًا مستقلًا كما في «أي خدمة» (كانت داخل «إدارة الأقسام»).
        to: "/admin/product-fields",
        icon: "fields",
        labelKey: "حقول النماذج",
        perm: "product-fields",
        data: ["/api/admin/product-fields"],
      },
      {
        to: "/admin/app",
        icon: "app",
        labelKey: "تطبيق الجوال",
        perm: "app",
        data: ["/api/admin/app-links"],
      },
      {
        // «ترتيب القوائم» (مثل «أي خدمة»، AYK-410): الإدارة ترتّب قائمتها بنفسها.
        to: "/admin/menu-layout",
        icon: "menus",
        labelKey: "ترتيب القوائم",
        perm: "menu-layout",
        data: ["/api/admin/menu-layout"],
      },
    ],
  },
  {
    // الخدمات المربوطة وإثبات الملكية ومراجعة المتاجر.
    label: "الربط والتوثيق",
    items: [
      {
        to: "/admin/integrations",
        icon: "integrations",
        labelKey: "تكاملات API",
        perm: "integrations",
        data: ["/api/admin/integrations"],
      },
      {
        to: "/admin/verification",
        icon: "verification",
        labelKey: "إثبات ملكية النطاق",
        perm: "verification",
        data: ["/api/admin/verification"],
      },
      {
        to: "/admin/review",
        icon: "review",
        labelKey: "مراجعة المتاجر",
        perm: "review",
        data: ["/api/admin/store-review"],
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
/**
 * ترتيب المدير الشخصي (طلب المالك 2026-11-28): ترتيب المجموعات، وترتيب الصفحات داخل كل مجموعة.
 * للعرض فقط: لا يضيف صفحة ولا يُظهر مخفية ولا يغيّر الصلاحيات.
 */
export type MenuOrder = { groups: string[]; items: Record<string, string[]> };

export function cleanMenuOrder(body: unknown): MenuOrder | null {
  const b = body as { groups?: unknown; items?: unknown } | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.groups)) return null;
  if (b.groups.length > 20) return null;
  const groups: string[] = [];
  for (const k of b.groups) {
    if (typeof k !== "string" || !k.trim() || k.length > 60) return null;
    if (!groups.includes(k)) groups.push(k);
  }
  const items: Record<string, string[]> = {};
  const raw = (b.items ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  for (const [k, list] of Object.entries(raw)) {
    if (!groups.includes(k) || !Array.isArray(list) || list.length > 100)
      return null;
    const seen: string[] = [];
    for (const to of list) {
      if (typeof to !== "string" || !MENU_PATH.test(to)) return null;
      if (!seen.includes(to)) seen.push(to);
    }
    items[k] = seen;
  }
  return { groups, items };
}

/** يرتّب المجموعات والصفحات بترتيب المدير؛ ما ليس فيه يبقى في مكانه بعد المرتَّب. */
export function applyMenuOrder<
  G extends { key: string; items: { to: string }[] },
>(groups: G[], order: MenuOrder | null | undefined): G[] {
  if (!order) return groups;
  const rank = (list: string[], key: string) => {
    const i = list.indexOf(key);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return groups
    .map((g, i) => ({ g, i }))
    .sort(
      (a, b) =>
        rank(order.groups, a.g.key) - rank(order.groups, b.g.key) || a.i - b.i,
    )
    .map(({ g }) => {
      const mine = order.items[g.key];
      if (!mine) return g;
      return {
        ...g,
        items: g.items
          .map((it, i) => ({ it, i }))
          .sort(
            (a, b) => rank(mine, a.it.to) - rank(mine, b.it.to) || a.i - b.i,
          )
          .map(({ it }) => it),
      };
    });
}

/** المجموعات بالترتيب المحفوظ وبما يحق له فقط؛ المجموعة الفارغة لا تظهر. */
export function visibleGroups(
  user: Who,
  layout?: MenuLayout | null,
  order?: MenuOrder | null,
) {
  return applyMenuOrder(applyMenuLayout(NAV_GROUPS, layout), order)
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => allowedItem(user, it)),
    }))
    .filter((g) => g.items.length > 0);
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

/**
 * «ترتيب القوائم» (من «أي خدمة»، AYK-410): ترتيب الإدارة المحفوظ يُطبَّق على القائمة الأصلية أعلاه.
 * layout = { groups: [{ key, title, items: [to…] }], hidden: [to…] }
 * - المجموعات بترتيبها المحفوظ، باسمها المحفوظ أو اسمها الأصلي.
 * - كل صفحة حيث وُضعت. والصفحات التي لا يعرفها الترتيب المحفوظ (أُضيفت لاحقًا) تبقى في مجموعتها
 *   الأصلية، والمجموعة الجديدة كلها تظهر في آخر القائمة، فلا تضيع صفحة أبدًا.
 * - المخفية لا تظهر، والمجموعة التي فرغت لا تظهر.
 */
export type MenuLayout = {
  groups: { key: string; title: string | null; items: string[] }[];
  hidden: string[];
};
export type LaidGroup = {
  key: string;
  label: string | null;
  title: string | null;
  items: AdminNavItem[];
};
/** لا تُخفى لوحة التحكم ولا هذه الصفحة، وإلا لم يستطع أحد التراجع. */
export const LOCKED = new Set(["/admin", "/admin/menu-layout"]);

export function applyMenuLayout(
  defaults: AdminNavGroup[],
  layout: MenuLayout | null | undefined,
  { keepHidden = false } = {},
): LaidGroup[] {
  const base = defaults.map((g) => ({
    key: g.label,
    label: g.label as string | null,
    title: null as string | null,
    items: [...g.items],
  }));
  if (!layout || !Array.isArray(layout.groups) || !layout.groups.length)
    return base;
  const byTo = new Map(
    defaults.flatMap((g) => g.items.map((it) => [it.to, it] as const)),
  );
  const placed = new Set<string>();
  const groups: LaidGroup[] = layout.groups.map((g) => {
    const own = defaults.find((d) => d.label === g.key);
    const items = (g.items || [])
      .map((to) => byTo.get(to))
      .filter((it): it is AdminNavItem => Boolean(it));
    for (const it of items) placed.add(it.to);
    return {
      key: g.key,
      label: own?.label ?? null,
      title: g.title || null,
      items,
    };
  });
  for (const d of defaults)
    for (const it of d.items) {
      if (placed.has(it.to)) continue;
      // مجموعتها الأصلية إن كانت في الترتيب، وإلا تُضاف المجموعة كاملة في آخر القائمة.
      let home = groups.find((g) => g.key === d.label);
      if (!home) {
        home = { key: d.label, label: d.label, title: null, items: [] };
        groups.push(home);
      }
      home.items.push(it);
    }
  const hidden = new Set(keepHidden ? [] : layout.hidden || []);
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !hidden.has(it.to)) }))
    .filter((g) => g.items.length);
}

/** اسم المجموعة كما يظهر: المحفوظ، وإلا الأصلي. */
export const groupTitle = (g: { title: string | null; label: string | null }) =>
  g.title || g.label || "";

/** الترتيب كائنًا بسيطًا للحفظ، من مجموعات بشكل نتيجة applyMenuLayout. */
export function toLayout(
  groups: LaidGroup[],
  hidden: Iterable<string>,
): MenuLayout {
  return {
    groups: groups.map((g) => ({
      key: g.key,
      title: g.title && g.title !== g.label ? g.title : null,
      items: g.items.map((it) => it.to),
    })),
    hidden: [...hidden],
  };
}

const MENU_PATH = /^\/admin(\/[a-z0-9\-/]*)?$/;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
/**
 * ما يُقبل حفظه (يفحصه الخادم): حتى 20 مجموعة، لكل مجموعة مفتاح واسم قصيران وصفحات من /admin فقط،
 * ولا تتكرر صفحة. وإلا null.
 */
export function cleanMenuLayout(body: unknown): MenuLayout | null {
  const b = body as { groups?: unknown; hidden?: unknown } | null;
  if (
    !b ||
    typeof b !== "object" ||
    !Array.isArray(b.groups) ||
    b.groups.length > 20
  )
    return null;
  const seen = new Set<string>();
  const groups: MenuLayout["groups"] = [];
  for (const raw of b.groups) {
    const g = raw as { key?: unknown; title?: unknown; items?: unknown };
    if (
      !g ||
      !text(g.key, 60) ||
      !Array.isArray(g.items) ||
      g.items.length > 100
    )
      return null;
    if (g.title != null && g.title !== "" && !text(g.title, 60)) return null;
    const items: string[] = [];
    for (const to of g.items) {
      if (typeof to !== "string" || !MENU_PATH.test(to) || seen.has(to))
        return null;
      seen.add(to);
      items.push(to);
    }
    groups.push({
      key: g.key.trim(),
      title:
        typeof g.title === "string" && g.title.trim() ? g.title.trim() : null,
      items,
    });
  }
  const hidden = Array.isArray(b.hidden)
    ? b.hidden
        .filter(
          (to): to is string => typeof to === "string" && MENU_PATH.test(to),
        )
        .slice(0, 100)
    : [];
  return { groups, hidden: hidden.filter((to) => !LOCKED.has(to)) };
}
