import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { can } from "../lib/permissions";
import { db, transaction } from "./db";
import { HttpError, decryptDocument, encryptDocument } from "./security";
import { normalizeNationalId } from "./validation";
import { notifyApprovers, privateKey } from "./management";

/**
 * المندوب: عضو يتفق مع الأسر المنتجة على توصيل طلبات زبائنها.
 * يسجّل بالاسم الحقيقي والجوال (حسابه المتحقق) ورقم الهوية وصورتها ونوع السيارة ومدينة العمل،
 * ويظهر للأسر في «المندوبين» بعد اعتماد الإدارة. الهوية رقمًا وصورةً للإدارة فقط.
 */
const courierSchema = z
  .object({
    name: z.string().trim().min(2, "اكتب الاسم الحقيقي").max(120),
    nationalId: z.string().max(30),
    documentId: z.uuid({ error: "أرفق صورة الهوية" }),
    carType: z.string().trim().min(2, "اكتب نوع السيارة").max(80),
    cityId: z.string().min(1, "اختر مدينة العمل").max(50),
    showPhone: z.boolean().default(true),
    showWhatsapp: z.boolean().default(true),
  })
  .strict();

const decryptId = (payload: Buffer) =>
  decryptDocument(payload, privateKey()).toString("utf8");

export async function ownCourier(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT k.id,k.name,k.city_id AS "cityId",c.region_id AS "regionId",k.car_type AS "carType",k.document_id AS "documentId",
        k.show_phone AS "showPhone",k.show_whatsapp AS "showWhatsapp",k.status,k.review_reason AS "reviewReason",k.national_id_encrypted
       FROM jdatna.courier_profiles k JOIN jdatna.cities c ON c.id=k.city_id WHERE k.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) return null;
  const { national_id_encrypted: encrypted, ...rest } = row;
  return { ...rest, nationalId: decryptId(encrypted) };
}

export async function saveCourier(user: SessionUser, input: unknown) {
  const value = courierSchema.parse(input);
  const nationalId = normalizeNationalId(value.nationalId);
  if (user.role !== "customer" && user.role !== "courier")
    throw new HttpError(
      409,
      "هذا الحساب أسرة منتجة أو إدارة؛ سجّل المندوب بجوال آخر",
    );
  const saved = await transaction(async (client) => {
    const document = (
      await client.query(
        "SELECT type FROM jdatna.producer_documents WHERE id=$1 AND user_id=$2",
        [value.documentId, user.id],
      )
    ).rows[0];
    if (!document || document.type !== "national_id")
      throw new HttpError(400, "صورة الهوية غير صالحة؛ أرفقها من جديد");
    const city = (
      await client.query("SELECT 1 FROM jdatna.cities WHERE id=$1", [
        value.cityId,
      ])
    ).rowCount;
    if (!city) throw new HttpError(400, "اختر مدينة العمل");
    const existing = (
      await client.query(
        "SELECT id,status,name,document_id,national_id_encrypted FROM jdatna.courier_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    // تغيير الاسم أو الهوية يعيد المراجعة؛ تغيير السيارة أو المدينة أو ظهور الرقم لا يعيدها.
    const identityChanged =
      !existing ||
      existing.name !== value.name ||
      existing.document_id !== value.documentId ||
      decryptId(existing.national_id_encrypted) !== nationalId;
    const status =
      !existing || identityChanged || existing.status === "rejected"
        ? "pending"
        : (existing.status as string);
    const id = (existing?.id as string | undefined) ?? randomUUID();
    await client.query(
      `INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,document_id,national_id_encrypted,show_phone,show_whatsapp,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,city_id=EXCLUDED.city_id,car_type=EXCLUDED.car_type,
         document_id=EXCLUDED.document_id,national_id_encrypted=EXCLUDED.national_id_encrypted,
         show_phone=EXCLUDED.show_phone,show_whatsapp=EXCLUDED.show_whatsapp,status=EXCLUDED.status,updated_at=now()`,
      [
        id,
        user.id,
        value.name,
        value.cityId,
        value.carType,
        value.documentId,
        encryptDocument(Buffer.from(nationalId), privateKey()),
        value.showPhone,
        value.showWhatsapp,
        status,
      ],
    );
    await client.query(
      "UPDATE jdatna.users SET role='courier' WHERE id=$1 AND role='customer'",
      [user.id],
    );
    return {
      id,
      status,
      newlyPending:
        status === "pending" && (!existing || existing.status !== "pending"),
    };
  });
  if (saved.newlyPending)
    void notifyApprovers(
      value.name,
      `المندوب «${value.name}» سجّل وينتظر الاعتماد.`,
      "مندوب ينتظر الاعتماد",
    );
  return { id: saved.id, status: saved.status };
}

/** «المندوبين»: للأسر المنتجة المعتمدة والإدارة فقط. */
async function assertCanBrowse(user: SessionUser) {
  if (can(user, "producers")) return;
  const family = (
    await db().query(
      "SELECT 1 FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
      [user.id],
    )
  ).rowCount;
  if (!family)
    throw new HttpError(403, "قائمة المندوبين للأسر المنتجة المعتمدة");
}

export type CourierCard = {
  id: string;
  userId: string;
  name: string;
  carType: string;
  cityName: string;
  regionName: string;
  phone: string | null;
  whatsapp: string | null;
};

export async function listCouriers(
  user: SessionUser,
  filters: { region?: string; city?: string },
): Promise<CourierCard[]> {
  await assertCanBrowse(user);
  const args: unknown[] = [];
  const where = [
    "k.status='approved'",
    "u.suspended_at IS NULL",
    "u.deleted_at IS NULL",
  ];
  if (filters.city) {
    args.push(filters.city);
    where.push(`k.city_id=$${args.length}`);
  } else if (filters.region) {
    args.push(filters.region);
    where.push(`c.region_id=$${args.length}`);
  }
  return (
    await db().query(
      `SELECT k.id,k.user_id AS "userId",k.name,k.car_type AS "carType",c.name AS "cityName",r.name AS "regionName",
         CASE WHEN k.show_phone THEN u.phone END AS phone,
         CASE WHEN k.show_whatsapp THEN u.phone END AS whatsapp
       FROM jdatna.courier_profiles k
       JOIN jdatna.users u ON u.id=k.user_id
       JOIN jdatna.cities c ON c.id=k.city_id
       JOIN jdatna.regions r ON r.id=c.region_id
       WHERE ${where.join(" AND ")}
       ORDER BY k.approved_at DESC NULLS LAST LIMIT 200`,
      args,
    )
  ).rows;
}

/** الإدارة: المندوبون بانتظار الاعتماد وغيرهم، مع رقم الهوية وصورتها (للمراجعة فقط). */
export async function adminCouriers(user: SessionUser) {
  if (!can(user, "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const rows = (
    await db().query(
      `SELECT k.id,k.user_id AS "userId",k.name,u.phone,k.car_type AS "carType",c.name AS "cityName",
         k.document_id AS "documentId",k.status,k.review_reason AS "reviewReason",k.created_at AS "createdAt",k.national_id_encrypted
       FROM jdatna.courier_profiles k JOIN jdatna.users u ON u.id=k.user_id JOIN jdatna.cities c ON c.id=k.city_id
       ORDER BY (k.status='pending') DESC,k.created_at DESC LIMIT 200`,
    )
  ).rows;
  return rows.map(({ national_id_encrypted: encrypted, ...rest }) => ({
    ...rest,
    nationalId: decryptId(encrypted),
  }));
}

export async function reviewCourier(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  if (!can(user, "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const value = z
    .object({
      decision: z.enum(["approved", "rejected", "suspended"]),
      reason: z.string().trim().min(5, "اكتب ملاحظة القرار").max(2000),
    })
    .strict()
    .parse(input);
  const result = await transaction(async (client) => {
    const courier = (
      await client.query(
        "SELECT id,user_id,status,approved_at FROM jdatna.courier_profiles WHERE id=$1 FOR UPDATE",
        [z.uuid().parse(id)],
      )
    ).rows[0];
    if (!courier) throw new HttpError(404, "المندوب غير موجود");
    if (courier.user_id === user.id)
      throw new HttpError(403, "لا يمكن مراجعة حسابك بنفسك");
    await client.query(
      `UPDATE jdatna.courier_profiles SET status=$2,review_reason=$3,reviewer_id=$4,updated_at=now(),
         approved_at=CASE WHEN $2='approved' THEN COALESCE(approved_at,now()) ELSE approved_at END WHERE id=$1`,
      [courier.id, value.decision, value.reason, user.id],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        user.id,
        "courier.review",
        courier.id,
        JSON.stringify(value),
      ],
    );
    return {
      status: value.decision,
      congratulate:
        value.decision === "approved" && !courier.approved_at
          ? (courier.user_id as string)
          : null,
    };
  });
  if (result.congratulate) {
    const { notifyUser } = await import("./push");
    void notifyUser(result.congratulate, {
      title: "مبارك اعتمادك مندوبًا",
      body: "تم اعتماد حسابك، وصار ظاهرًا للأسر المنتجة في «المندوبين». نسأل الله لنا ولكم التوفيق",
      url: "/courier",
      tag: "courier-approved",
    });
  }
  return { status: result.status };
}

/** عدد المندوبين بانتظار الاعتماد (يُضاف لعدّاد الاعتماد في الإدارة). */
export async function pendingCouriers() {
  return (
    await db().query(
      "SELECT count(*)::int AS n FROM jdatna.courier_profiles WHERE status='pending'",
    )
  ).rows[0].n as number;
}
