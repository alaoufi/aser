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

/**
 * هل له «حساب الإدارة»؟ المدير الكامل، أو أي عضو (عميل أو أسرة منتجة)
 * أُعطي صلاحية إدارية واحدة على الأقل. نوع حسابه الخاص لا يتغير.
 */
export function isManager(user: Who) {
  return user?.role === "admin" || Boolean(user?.permissions?.length);
}
/** المدير الكامل يملك كل شيء؛ غيره ما أُعطي من صلاحيات فقط. */
export function can(user: Who, permission: AdminPermission) {
  return (
    user?.role === "admin" || Boolean(user?.permissions?.includes(permission))
  );
}
