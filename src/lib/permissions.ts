/** صلاحيات المشرف: كل صلاحية تفتح قسمًا من الإدارة. المدير الكامل يملكها كلها. */
export const adminPermissions = {
  producers: "مراجعة الأسر والمستندات",
  orders: "الطلبات",
  products: "المنتجات",
  categories: "الأقسام",
  locations: "المواقع والتغطية",
  reports: "البلاغات",
  content: "قالب الموقع ونصوصه",
} as const;
export type AdminPermission = keyof typeof adminPermissions;
type Who = { role: string; permissions?: string[] | null } | null | undefined;

/** هل يدخل لوحة الإدارة أصلًا (مدير أو مشرف)؟ */
export function isManager(user: Who) {
  return user?.role === "admin" || user?.role === "staff";
}
/** المدير الكامل يملك كل شيء؛ المشرف ما أُعطي فقط. */
export function can(user: Who, permission: AdminPermission) {
  return (
    user?.role === "admin" ||
    (user?.role === "staff" && Boolean(user.permissions?.includes(permission)))
  );
}
