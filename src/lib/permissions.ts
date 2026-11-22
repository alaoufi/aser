/**
 * صلاحيات الإدارة (قرار المالك 2026-11-22: «مدير عام للكل، ومدير مخصص يحدد له أقسام يدخل عليها»):
 * كل قسم في القائمة الجانبية صلاحية مستقلة بمعرّفه نفسه. «المدير العام» (role=admin) يملكها كلها،
 * و«المدير المخصص» ما اختير له منها فقط. «الأعضاء والصلاحيات» للمدير العام وحده، فلا يرفع مخصصٌ
 * صلاحياته بنفسه. لوحة التحكم تفتح لكل أعضاء الإدارة.
 */
export const adminPermissions = {
  views: "المشاهدات والزوار",
  ads: "الإعلانات الترويجية",
  security: "التقرير الأمني",
  backups: "النسخ الاحتياطية",
  activity: "سجل النشاطات",
  approvals: "اعتماد الأسر والمندوبين",
  producers: "الأسر المنتجة",
  orders: "الطلبات",
  contracts: "عقود الاشتراكات",
  reports: "البلاغات",
  "deleted-chats": "المحادثات المحذوفة",
  suggestions: "الاقتراحات",
  products: "المنتجات",
  categories: "إدارة الأقسام",
  "product-fields": "حقول النماذج",
  locations: "المواقع",
  coverage: "التغطية التفصيلية",
  template: "قالب الموقع",
  texts: "نصوص الموقع",
  app: "تطبيق الجوال",
  "menu-layout": "ترتيب القوائم",
  integrations: "تكاملات API",
  verification: "إثبات ملكية النطاق",
  review: "مراجعة المتاجر",
} as const;
export type AdminPermission = keyof typeof adminPermissions;
export const ADMIN_PERMISSION_IDS = Object.keys(
  adminPermissions,
) as AdminPermission[];
type Who = { role: string; permissions?: string[] | null } | null | undefined;

/**
 * هل له «حساب الإدارة»؟ المدير العام، أو أي عضو (عميل أو أسرة منتجة)
 * أُعطي قسمًا إداريًا واحدًا على الأقل. نوع حسابه الشخصي لا يتغير.
 */
export function isManager(user: Who) {
  return user?.role === "admin" || Boolean(user?.permissions?.length);
}
/** المدير العام يملك كل شيء؛ المخصص ما أُعطي من أقسام فقط. */
export function can(user: Who, permission: AdminPermission) {
  return (
    user?.role === "admin" || Boolean(user?.permissions?.includes(permission))
  );
}
/** يكفي أحد الأقسام (بيانات يعرضها أكثر من قسم، مثل ملفات الأسر في «الاعتماد» و«الأسر المنتجة»). */
export function canAny(user: Who, ...permissions: AdminPermission[]) {
  return permissions.some((p) => can(user, p));
}
