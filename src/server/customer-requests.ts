import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";
import { cleanPhone } from "./directory";

/**
 * «طلبات العملاء» (قرار المالك 2026-11-22): العميل ينشر ما يريد (مثل «جريش لعشرة يوم الخميس»)،
 * وتراه الأسر المنتجة المعتمدة، وتفلتره بمنطقتها وبما يشبه منتجاتها، وتراسله من الموقع.
 * اسمه وجواله وواتسابه لا تظهر إلا بموافقته على كل واحد منها؛ بلا موافقة يظهر «عميل» فقط.
 * يُغلق الطلب صاحبه متى شاء، ويختفي تلقائيًا بعد 14 يومًا.
 */
export type CustomerRequest = {
  id: string;
  body: string;
  categoryId: string | null;
  categoryName: string | null;
  cityName: string;
  regionId: string;
  people: number | null;
  neededOn: string | null;
  createdAt: string;
  status: "open" | "closed" | "expired";
  /** ما سمح العميل بإظهاره فقط. */
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  mine: boolean;
};

const createSchema = z.object({
  body: z.string().trim().min(3, "اكتب طلبك").max(500),
  categoryId: z.string().trim().max(40).optional().nullable(),
  cityId: z.string().trim().min(1, "اختر المدينة").max(60),
  people: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  neededOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  showName: z.boolean().default(false),
  showPhone: z.boolean().default(false),
  showWhatsapp: z.boolean().default(false),
  whatsapp: z.string().trim().max(30).optional().nullable(),
});

const select = `SELECT r.id,r.body,r.category_id AS "categoryId",cat.name AS "categoryName",
  c.name AS "cityName",c.region_id AS "regionId",r.people,to_char(r.needed_on,'YYYY-MM-DD') AS "neededOn",
  r.created_at AS "createdAt",
  -- انتهت مدة ظهوره (14 يومًا) ولم يُغلق: يراه صاحبه «انتهت مدته» لا «مفتوحًا» (مراجعة 2026-11-24).
  CASE WHEN r.status='open' AND r.expires_at<=now() THEN 'expired' ELSE r.status END AS status,
  CASE WHEN r.show_name OR r.user_id=$1 THEN u.name END AS name,
  CASE WHEN r.show_phone OR r.user_id=$1 THEN u.phone END AS phone,
  CASE WHEN r.show_whatsapp OR r.user_id=$1 THEN r.whatsapp END AS whatsapp,
  (r.user_id=$1) AS mine
  FROM jdatna.customer_requests r
  JOIN jdatna.cities c ON c.id=r.city_id
  JOIN jdatna.users u ON u.id=r.user_id
  LEFT JOIN jdatna.categories cat ON cat.id=r.category_id`;

export async function createCustomerRequest(user: SessionUser, input: unknown) {
  const v = createSchema.parse(input);
  const whatsapp = v.whatsapp ? cleanPhone(v.whatsapp) : null;
  if (v.showWhatsapp && !whatsapp)
    throw new HttpError(400, "اكتب رقم واتساب أو ألغِ إظهاره", {
      field: "whatsapp",
    });
  if (v.neededOn && v.neededOn < new Date().toISOString().slice(0, 10))
    throw new HttpError(400, "التاريخ مضى", { field: "neededOn" });
  const open = (
    await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM jdatna.customer_requests WHERE user_id=$1 AND status='open' AND expires_at>now()",
      [user.id],
    )
  ).rows[0].n;
  if (open >= 5)
    throw new HttpError(400, "لك 5 طلبات مفتوحة؛ أغلق ما وجدت له أسرة أولًا");
  const city = (
    await db().query("SELECT 1 FROM jdatna.cities WHERE id=$1", [v.cityId])
  ).rowCount;
  if (!city)
    throw new HttpError(400, "المدينة غير معروفة", { field: "cityId" });
  const id = randomUUID();
  await db().query(
    `INSERT INTO jdatna.customer_requests(id,user_id,body,category_id,city_id,people,needed_on,show_name,show_phone,show_whatsapp,whatsapp)
     VALUES($1,$2,$3,(SELECT id FROM jdatna.categories WHERE id=$4 AND NOT hidden),$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      user.id,
      v.body,
      v.categoryId ?? null,
      v.cityId,
      v.people ?? null,
      v.neededOn ?? null,
      v.showName,
      v.showPhone,
      v.showWhatsapp,
      whatsapp,
    ],
  );
  return { id };
}

/** طلبات العضو نفسه (مفتوحة ومغلقة، آخر 60 يومًا). */
export async function myCustomerRequests(user: SessionUser) {
  return (
    await db().query<CustomerRequest>(
      `${select} WHERE r.user_id=$1 AND r.created_at>now()-interval '60 days' ORDER BY r.created_at DESC LIMIT 50`,
      [user.id],
    )
  ).rows;
}

/**
 * الطلبات المفتوحة للأسر المعتمدة (والإدارة)، مع فلتري «منطقتي» و«مشابه لمنتجاتي».
 * غير الأسرة لا يرى طلبات غيره.
 */
export async function openCustomerRequests(
  user: SessionUser,
  f: { region?: string | null; categories?: string[] | null } = {},
) {
  const family = (
    await db().query<{ review_only: boolean }>(
      "SELECT review_only FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
      [user.id],
    )
  ).rows[0];
  if (!family && user.role !== "admin")
    throw new HttpError(403, "طلبات العملاء تراها الأسر المنتجة المعتمدة");
  return (
    await db().query<CustomerRequest>(
      // الأسرة تطلب من الأسر الأخرى كعميل (قرار المالك 2026-11-26): طلبها لا يظهر في لوحتها.
      `${select} WHERE r.status='open' AND r.expires_at>now() AND r.user_id<>$1
         AND ($2::text IS NULL OR c.region_id=$2)
         AND ($3::text[] IS NULL OR r.category_id=ANY($3::text[]))
         AND u.suspended_at IS NULL AND u.deleted_at IS NULL
         AND ($4::boolean IS NULL OR u.review_account=$4)
       ORDER BY r.created_at DESC LIMIT 200`,
      // أسرة مراجعة المتاجر ترى طلبات حساب المراجعة فقط، والأسر الحقيقية لا تراها.
      [
        user.id,
        f.region ?? null,
        f.categories ?? null,
        family ? family.review_only : null,
      ],
    )
  ).rows;
}

export async function closeCustomerRequest(user: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "غير موجود");
  const r = await db().query(
    "UPDATE jdatna.customer_requests SET status='closed' WHERE id=$1 AND user_id=$2",
    [id, user.id],
  );
  if (!r.rowCount) throw new HttpError(404, "غير موجود");
  return { ok: true };
}
