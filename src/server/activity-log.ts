import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * «سجل النشاطات» (من «أي خدمة»): ما فعله أعضاء الإدارة، من جدول admin_audit_logs الذي يُكتب مع كل إجراء.
 * للمدير الكامل فقط. يُعرض أحدث 100 ثم «أقدم» بالصفحات، ويُصفّى بنوع الإجراء أو باسم العضو.
 */
export const ACTIVITY_GROUPS: Record<
  string,
  { label: string; prefixes: string[] }
> = {
  families: {
    label: "الأسر والمندوبون",
    prefixes: ["producer.", "courier."],
  },
  catalog: {
    label: "المنتجات والأقسام",
    prefixes: ["product.", "category.", "location.", "coverage."],
  },
  members: { label: "الأعضاء والحسابات", prefixes: ["member.", "account."] },
  reports: { label: "البلاغات", prefixes: ["report."] },
  site: {
    label: "إعدادات الموقع",
    prefixes: ["site.", "admin.", "store-review.", "approval."],
  },
  backups: { label: "النسخ الاحتياطية", prefixes: ["backup."] },
};

/** اسم الإجراء بالعربية كما يقرؤه المدير؛ ما لا اسم له يُعرض كما هو. */
export const ACTION_LABELS: Record<string, string> = {
  "producer.review": "قرار مراجعة أسرة",
  "courier.review": "قرار مراجعة مندوب",
  "product.moderate": "إخفاء منتج أو إظهاره أو تمييزه",
  "product.delete": "حذف منتج",
  "product.field": "تعديل حقول نموذج المنتج",
  "category.create": "إضافة قسم",
  "category.update": "تعديل قسم",
  "category.delete": "حذف قسم",
  "category.hide": "إخفاء قسم",
  "category.show": "إظهار قسم",
  "location.create": "إضافة موقع",
  "coverage.curate": "تعديل التغطية",
  "member.create": "إضافة عضو",
  "member.access": "تعديل صلاحيات عضو",
  "member.suspend": "إيقاف عضو",
  "member.unsuspend": "إعادة تفعيل عضو",
  "member.password": "تعيين كلمة مرور عضو",
  "account.delete": "حذف حساب",
  "report.update": "تحديث بلاغ",
  "site.template": "تغيير قالب الموقع",
  "site.text": "تعديل نص في الموقع",
  "site.app-links": "روابط التطبيق",
  "site.domain-verification": "رمز إثبات ملكية النطاق",
  "site.views": "إعداد المشاهدات",
  "admin.menu-layout": "ترتيب القوائم",
  "store-review.setup": "حساب مراجعة المتاجر",
  "approval.title": "نص تنبيه الاعتماد",
  "approval.message": "رسالة الاعتماد",
  "backup.request": "طلب نسخة احتياطية",
  "backup.download": "تحميل نسخة احتياطية",
  "backup.delete": "حذف نسخة احتياطية",
};

const query = z
  .object({
    group: z
      .enum(Object.keys(ACTIVITY_GROUPS) as [string, ...string[]])
      .optional(),
    q: z.string().trim().max(80).optional(),
    before: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type ActivityRow = {
  id: string;
  action: string;
  label: string;
  actorName: string | null;
  actorPhone: string | null;
  targetId: string | null;
  details: string;
  createdAt: string;
};

export async function activityLog(user: SessionUser, input: unknown) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
  const { group, q, before } = query.parse(input);
  const prefixes = group ? ACTIVITY_GROUPS[group].prefixes : null;
  const rows = (
    await db().query<
      Omit<ActivityRow, "label" | "details"> & { details: unknown }
    >(
      `SELECT l.id,l.action,u.name AS "actorName",u.phone AS "actorPhone",l.target_id AS "targetId",
         l.details,l.created_at AS "createdAt"
       FROM jdatna.admin_audit_logs l LEFT JOIN jdatna.users u ON u.id=l.actor_id
       WHERE ($1::text[] IS NULL OR EXISTS (SELECT 1 FROM unnest($1::text[]) p WHERE l.action LIKE p || '%'))
         AND ($2::text IS NULL OR u.name ILIKE '%' || $2 || '%' OR u.phone LIKE '%' || $2 || '%')
         AND ($3::timestamptz IS NULL OR l.created_at < $3)
       ORDER BY l.created_at DESC LIMIT 101`,
      [prefixes, q || null, before ?? null],
    )
  ).rows;
  const more = rows.length > 100;
  return {
    rows: rows.slice(0, 100).map((r) => ({
      ...r,
      label: ACTION_LABELS[r.action] ?? r.action,
      // التفاصيل نص قصير للعرض فقط.
      details: JSON.stringify(r.details ?? {}).slice(0, 300),
    })),
    more,
    groups: Object.entries(ACTIVITY_GROUPS).map(([id, g]) => ({
      id,
      label: g.label,
    })),
  };
}
