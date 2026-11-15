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
const price = z.number().min(0).max(99999).multipleOf(0.01).nullable();
const courierSchema = z
  .object({
    name: z.string().trim().min(2, "اكتب الاسم الحقيقي").max(120),
    nationalId: z.string().max(30),
    documentId: z.uuid({ error: "أرفق صورة الهوية" }),
    carType: z.string().trim().min(2, "اكتب نوع السيارة").max(80),
    cityId: z.string().min(1, "اختر مدينة العمل").max(50),
    showPhone: z.boolean().default(true),
    showWhatsapp: z.boolean().default(true),
    /** سعر التوصيل داخل المدينة؛ فارغ = حسب الاتفاق مع الأسرة. */
    cityPrice: price.default(null),
    /** المراكز التابعة للمدينة التي يخدمها، ولكل مركز سعره (فارغ = بالاتفاق). */
    centers: z
      .array(z.object({ nodeId: z.string().min(1).max(200), price }).strict())
      .max(100)
      .default([]),
  })
  .strict();

const decryptId = (payload: Buffer) =>
  decryptDocument(payload, privateKey()).toString("utf8");

export async function ownCourier(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT k.id,k.name,k.city_id AS "cityId",c.region_id AS "regionId",k.car_type AS "carType",k.document_id AS "documentId",
        k.show_phone AS "showPhone",k.show_whatsapp AS "showWhatsapp",k.status,k.review_reason AS "reviewReason",k.national_id_encrypted,
        k.active,k.city_price::float8 AS "cityPrice",
        COALESCE((SELECT json_agg(json_build_object('nodeId',x.center_node_id,'price',x.price::float8)) FROM jdatna.courier_centers x WHERE x.courier_id=k.id),'[]') AS centers
       FROM jdatna.courier_profiles k JOIN jdatna.cities c ON c.id=k.city_id WHERE k.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) return null;
  const { national_id_encrypted: encrypted, ...rest } = row;
  return { ...rest, nationalId: decryptId(encrypted) };
}

/** المراكز التابعة لكل مدينة (من شجرة التغطية)، ليختار المندوب ما يخدمه منها. */
export async function centerOptions() {
  return (
    await db().query(
      `SELECT ct.city_id AS "cityId",n.id,n.name FROM jdatna.coverage_nodes n
       JOIN jdatna.coverage_nodes ct ON ct.id=n.parent_id AND ct.kind='city'
       WHERE n.kind='center' ORDER BY n.name`,
    )
  ).rows as { cityId: string; id: string; name: string }[];
}

/** «نشط الآن»: النشط يظهر للأسر، وغير النشط يختفي اسمه من «المندوبين». */
export async function setCourierActive(user: SessionUser, input: unknown) {
  const { active } = z.object({ active: z.boolean() }).strict().parse(input);
  const r = await db().query(
    "UPDATE jdatna.courier_profiles SET active=$2,updated_at=now() WHERE user_id=$1",
    [user.id, active],
  );
  if (!r.rowCount) throw new HttpError(404, "سجّل بيانات المندوب أولًا");
  return { active };
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
    // المراكز: التابعة لمدينة المندوب فقط، ولكل مركز سعره.
    const centerIds = [...new Set(value.centers.map((c) => c.nodeId))];
    const valid = (
      await client.query(
        `SELECT n.id FROM jdatna.coverage_nodes n JOIN jdatna.coverage_nodes ct ON ct.id=n.parent_id
         WHERE n.kind='center' AND ct.kind='city' AND ct.city_id=$1 AND n.id=ANY($2::text[])`,
        [value.cityId, centerIds],
      )
    ).rows.map((r) => r.id as string);
    if (valid.length !== centerIds.length)
      throw new HttpError(400, "اختر مراكز تابعة لمدينة عملك");
    await client.query(
      "UPDATE jdatna.courier_profiles SET city_price=$2 WHERE id=$1",
      [id, value.cityPrice],
    );
    await client.query(
      "DELETE FROM jdatna.courier_centers WHERE courier_id=$1",
      [id],
    );
    for (const c of value.centers.filter(
      (x, i, all) => all.findIndex((y) => y.nodeId === x.nodeId) === i,
    ))
      await client.query(
        "INSERT INTO jdatna.courier_centers(courier_id,center_node_id,price) VALUES($1,$2,$3)",
        [id, c.nodeId, c.price],
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

/**
 * «المندوبين»: للأسر المنتجة المعتمدة والإدارة فقط.
 * يُعيد معرّف ملف الأسرة لتصفية المندوبين حسب تغطيتها، أو null للإدارة (ترى الجميع).
 */
async function browseScope(user: SessionUser): Promise<string | null> {
  const family = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status='approved'",
      [user.id],
    )
  ).rows[0];
  if (family) return family.id as string;
  if (can(user, "producers")) return null;
  throw new HttpError(403, "قائمة المندوبين للأسر المنتجة المعتمدة");
}

/**
 * مناطق الأسرة: مدينتها، وعُقد تغطيتها، وتفاصيل تغطيتها (المدينة أو المركز المسمّى فيها)،
 * ثم سلسلة الأسلاف لكل عقدة. $1 = معرّف ملف الأسرة (أو null للإدارة فتكون فارغة).
 */
const familyAreasCte = `WITH RECURSIVE fam(node) AS (
    SELECT 'city:'||p.city_id FROM jdatna.producer_profiles p WHERE p.id=$1::uuid
    UNION SELECT c.node_id FROM jdatna.producer_coverage c WHERE c.producer_id=$1::uuid
    UNION SELECT d.city_node_id FROM jdatna.producer_coverage_details d WHERE d.producer_id=$1::uuid AND d.center IS NULL
    UNION SELECT n.id FROM jdatna.producer_coverage_details d JOIN jdatna.coverage_nodes n
      ON n.parent_id=d.city_node_id AND n.kind='center' AND n.name=d.center
      WHERE d.producer_id=$1::uuid AND d.center IS NOT NULL
  ), up(origin,id,kind,parent_id) AS (
    SELECT f.node,n.id,n.kind,n.parent_id FROM fam f JOIN jdatna.coverage_nodes n ON n.id=f.node
    UNION ALL SELECT u.origin,n.id,n.kind,n.parent_id FROM up u JOIN jdatna.coverage_nodes n ON n.id=u.parent_id
  ), origins AS (SELECT origin,bool_or(kind='center') AS in_center FROM up GROUP BY origin)`;

/**
 * يظهر المندوب للأسرة إذا وقعت إحدى مناطقها داخل مدينته (لا داخل مركز)،
 * أو في أحد المراكز التي يخدمها، أو كانت منطقة أعلى (منطقة/محافظة) تضم مدينته.
 */
const courierInFamilyArea = `(
    EXISTS (SELECT 1 FROM up u JOIN origins o ON o.origin=u.origin WHERE u.id='city:'||k.city_id AND NOT o.in_center)
    OR EXISTS (SELECT 1 FROM jdatna.courier_centers x JOIN up u ON u.id=x.center_node_id WHERE x.courier_id=k.id)
    OR EXISTS (SELECT 1 FROM jdatna.coverage_nodes cn LEFT JOIN jdatna.coverage_nodes g ON g.id=cn.parent_id
      WHERE cn.id='city:'||k.city_id AND (cn.parent_id IN (SELECT node FROM fam) OR g.parent_id IN (SELECT node FROM fam)))
  )`;

export type CourierCard = {
  id: string;
  userId: string;
  name: string;
  carType: string;
  cityName: string;
  regionName: string;
  phone: string | null;
  whatsapp: string | null;
  /** داخل المدينة؛ null = حسب الاتفاق. */
  cityPrice: number | null;
  centers: { name: string; price: number | null }[];
  ratingAverage: number | null;
  ratingCount: number;
};

export async function listCouriers(
  user: SessionUser,
  filters: { region?: string; city?: string; courierUserId?: string },
): Promise<CourierCard[]> {
  const family = await browseScope(user);
  const args: unknown[] = [family];
  // غير النشط يختفي اسمه من القائمة.
  const where = [
    "k.status='approved'",
    "k.active",
    "u.suspended_at IS NULL",
    "u.deleted_at IS NULL",
  ];
  if (family) where.push(courierInFamilyArea);
  if (filters.courierUserId) {
    args.push(filters.courierUserId);
    where.push(`k.user_id=$${args.length}`);
  }
  if (filters.city) {
    args.push(filters.city);
    where.push(`k.city_id=$${args.length}`);
  } else if (filters.region) {
    args.push(filters.region);
    where.push(`c.region_id=$${args.length}`);
  }
  return (
    await db().query(
      `${familyAreasCte}
       SELECT k.id,k.user_id AS "userId",k.name,k.car_type AS "carType",c.name AS "cityName",r.name AS "regionName",
         CASE WHEN k.show_phone THEN u.phone END AS phone,
         CASE WHEN k.show_whatsapp THEN u.phone END AS whatsapp,
         k.city_price::float8 AS "cityPrice",
         (SELECT round(avg(g.stars)::numeric,1)::float8 FROM jdatna.ratings g WHERE g.kind='courier' AND g.target_id=k.user_id) AS "ratingAverage",
         (SELECT count(*)::int FROM jdatna.ratings g WHERE g.kind='courier' AND g.target_id=k.user_id) AS "ratingCount",
         COALESCE((SELECT json_agg(json_build_object('name',n.name,'price',x.price::float8) ORDER BY n.name)
           FROM jdatna.courier_centers x JOIN jdatna.coverage_nodes n ON n.id=x.center_node_id WHERE x.courier_id=k.id),'[]') AS centers
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

/**
 * الأسرة تسند طلب توصيل لمندوب متاح في تغطيتها، فيصله موقع الاستلام (موقع الأسرة)
 * وموقع التوصيل (الموقع الذي أرسله العميل في طلبه). الإسناد في جدول مستقل عن الطلبات.
 */
export async function assignOrderCourier(user: SessionUser, input: unknown) {
  const value = z
    .object({
      orderId: z.uuid(),
      courierUserId: z.uuid(),
      pickupLocation: z
        .string()
        .trim()
        .min(5, "اكتب موقع الاستلام أو رابط الخريطة")
        .max(1000),
    })
    .strict()
    .parse(input);
  const order = (
    await db().query(
      `SELECT o.id,o.status,COALESCE(p.trade_name,p.name) AS family,f.method,o.snapshot->>'productName' AS product
       FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       LEFT JOIN jdatna.order_fulfillment f ON f.order_id=o.id
       WHERE o.id=$1 AND p.user_id=$2 AND p.status='approved'`,
      [value.orderId, user.id],
    )
  ).rows[0];
  if (!order) throw new HttpError(404, "الطلب غير موجود");
  if (order.method !== "delivery")
    throw new HttpError(409, "هذا الطلب استلام مباشر وليس توصيلًا");
  if (!["accepted", "preparing", "ready"].includes(order.status))
    throw new HttpError(409, "أسند المندوب بعد قبول الطلب وقبل اكتماله");
  const courier = (
    await listCouriers(user, { courierUserId: value.courierUserId })
  )[0];
  if (!courier) throw new HttpError(400, "المندوب غير متاح في تغطيتك الآن");
  const saved = await db().query(
    `INSERT INTO jdatna.order_couriers(order_id,courier_user_id,pickup_location,assigned_by) VALUES($1,$2,$3,$4)
     ON CONFLICT(order_id) DO UPDATE SET courier_user_id=EXCLUDED.courier_user_id,pickup_location=EXCLUDED.pickup_location,
       assigned_by=EXCLUDED.assigned_by,assigned_at=now()
     WHERE jdatna.order_couriers.status='assigned'`,
    [order.id, value.courierUserId, value.pickupLocation, user.id],
  );
  if (!saved.rowCount) throw new HttpError(409, "تم توصيل هذا الطلب");
  const { notifyUser } = await import("./push");
  void notifyUser(value.courierUserId, {
    title: "طلب توصيل جديد",
    body: `أسندت إليك «${order.family}» توصيل ${order.product ?? "طلب"}.`,
    url: "/courier",
    tag: `delivery-${order.id}`,
  });
  return { orderId: order.id as string, courierName: courier.name };
}

/** «طلبات التوصيل» عند المندوب: موقع الأسرة للاستلام وموقع العميل للتوصيل. */
export async function courierDeliveries(user: SessionUser) {
  return (
    await db().query(
      `SELECT oc.order_id AS "orderId",oc.status,oc.assigned_at AS "assignedAt",oc.delivered_at AS "deliveredAt",
         o.snapshot->>'productName' AS product,o.quantity,o.start_date::text AS "startDate",o.status AS "orderStatus",
         COALESCE(p.trade_name,p.name) AS family,p.phone AS "familyPhone",oc.pickup_location AS "pickupLocation",
         o.customer_name AS "customerName",o.phone AS "customerPhone",f.location AS "deliveryLocation"
       FROM jdatna.order_couriers oc
       JOIN jdatna.order_requests o ON o.id=oc.order_id
       JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       LEFT JOIN jdatna.order_fulfillment f ON f.order_id=o.id
       WHERE oc.courier_user_id=$1 AND o.status NOT IN ('declined','cancelled')
       ORDER BY (oc.status='assigned') DESC,oc.assigned_at DESC LIMIT 100`,
      [user.id],
    )
  ).rows;
}

/** المندوب يؤكد «تم التوصيل»، فيصل إشعار للأسرة. */
export async function markCourierDelivered(user: SessionUser, input: unknown) {
  const { orderId } = z.object({ orderId: z.uuid() }).strict().parse(input);
  const row = (
    await db().query(
      `UPDATE jdatna.order_couriers oc SET status='delivered',delivered_at=now()
       FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id
       WHERE oc.order_id=$1 AND oc.courier_user_id=$2 AND oc.status='assigned' AND o.id=oc.order_id
       RETURNING p.user_id AS "familyUserId",o.snapshot->>'productName' AS product`,
      [orderId, user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "طلب التوصيل غير موجود");
  const { notifyUser } = await import("./push");
  void notifyUser(row.familyUserId, {
    title: "تم التوصيل",
    body: `أوصل المندوب ${row.product ?? "الطلب"} إلى العميل.`,
    url: "/dashboard/orders",
    tag: `delivered-${orderId}`,
  });
  return { orderId, status: "delivered" };
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
