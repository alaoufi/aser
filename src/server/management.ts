import { randomUUID } from "node:crypto";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import {
  HttpError,
  normalizePhone,
  encryptDocument,
  decryptDocument,
} from "./security";
import { profileSchema, productSchema, reviewSchema } from "./validation";
import { productSelect, mapProduct } from "./catalog";
type ProducerPrivate = { nationalId: string; workLocation: string };
export function mergeProducerPrivate(
  existing: ProducerPrivate | null,
  input: { nationalId?: string; workLocation?: string },
  creating: boolean,
): ProducerPrivate | null {
  if (
    !creating &&
    !existing &&
    input.nationalId === undefined &&
    input.workLocation === undefined
  )
    return null;
  const nationalId = input.nationalId ?? existing?.nationalId,
    workLocation = input.workLocation ?? existing?.workLocation;
  if (!nationalId || !workLocation)
    throw new HttpError(400, "أدخل رقم الهوية ومكان مزاولة العمل للأسرة");
  return { nationalId, workLocation };
}
function privateKey() {
  const key = process.env.DOCUMENT_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new HttpError(503, "إعداد حفظ البيانات الخاصة غير مكتمل");
  return Buffer.from(key, "hex");
}
function decryptPrivate(payload: Buffer): ProducerPrivate {
  const value = JSON.parse(
    decryptDocument(payload, privateKey()).toString("utf8"),
  );
  if (
    value.version !== 1 ||
    typeof value.nationalId !== "string" ||
    typeof value.workLocation !== "string"
  )
    throw new Error("Invalid private profile");
  return { nationalId: value.nationalId, workLocation: value.workLocation };
}
export async function ownProfile(user: SessionUser) {
  const profile = (
    await db().query(
      `SELECT p.*,p.trade_name AS "tradeName",p.city_id AS "cityId",p.user_id AS "userId",ARRAY(SELECT category_id FROM jdatna.producer_categories WHERE producer_id=p.id) AS "categoryIds",v.document_id AS "documentId",v.document_type AS "documentType",v.reason AS "reviewReason",v.document_number AS "documentNumber",v.document_expires_at::text AS "documentExpiresAt",COALESCE((SELECT json_agg(json_build_object('platform',platform,'url',url)) FROM jdatna.producer_social_links WHERE producer_id=p.id),'[]') AS "socialLinks",COALESCE((SELECT json_agg(json_build_object('day',day,'opens',to_char(opens,'HH24:MI'),'closes',to_char(closes,'HH24:MI'))) FROM jdatna.business_hours WHERE producer_id=p.id),'[]') AS "businessHours",COALESCE((SELECT json_agg(json_build_object('cityId',city_id,'fee',fee)) FROM jdatna.delivery_areas WHERE producer_id=p.id),'[]') AS "deliveryAreas" FROM jdatna.producer_profiles p LEFT JOIN LATERAL(SELECT document_id,document_type,reason,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=p.id ORDER BY created_at DESC LIMIT 1)v ON true WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!profile) return null;
  const privateRow = (
    await db().query(
      "SELECT encrypted_payload FROM jdatna.producer_private WHERE producer_id=$1",
      [profile.id],
    )
  ).rows[0];
  const data = privateRow ? decryptPrivate(privateRow.encrypted_payload) : null;
  return {
    ...profile,
    nationalId: data?.nationalId ?? null,
    workLocation: data?.workLocation ?? null,
  };
}
export async function saveProfile(user: SessionUser, input: unknown) {
  const value = profileSchema.parse(input);
  const phone = normalizePhone(value.phone);
  if (phone !== user.phone)
    throw new HttpError(400, "رقم الملف يجب أن يطابق الجوال المتحقق منه");
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
      user.id,
    ]);
    const document = (
      await client.query(
        "SELECT id,type FROM jdatna.producer_documents WHERE id=$1 AND user_id=$2",
        [value.documentId, user.id],
      )
    ).rows[0];
    if (value.documentId && (!document || document.type !== value.documentType))
      throw new HttpError(400, "مستند الأهلية غير صالح أو غير مملوك لك");
    const existing = (
      await client.query(
        "SELECT * FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    const id = existing?.id ?? randomUUID();
    const delivery = value.delivery ?? existing?.delivery ?? false,
      pickup = value.pickup ?? existing?.pickup ?? true;
    if (!delivery && !pickup)
      throw new HttpError(400, "حدد وسيلة استلام واحدة على الأقل");
    let encrypted: Buffer | undefined;
    if (
      !existing ||
      value.nationalId !== undefined ||
      value.workLocation !== undefined
    ) {
      const stored = existing
        ? (
            await client.query(
              "SELECT encrypted_payload FROM jdatna.producer_private WHERE producer_id=$1",
              [id],
            )
          ).rows[0]
        : null;
      const data = mergeProducerPrivate(
        stored ? decryptPrivate(stored.encrypted_payload) : null,
        value,
        !existing,
      );
      if (data)
        encrypted = encryptDocument(
          Buffer.from(JSON.stringify({ version: 1, ...data })),
          privateKey(),
        );
    }
    await client.query(
      `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,description,city_id,neighborhood,phone,whatsapp,delivery,pickup,trade_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,city_id=EXCLUDED.city_id,neighborhood=EXCLUDED.neighborhood,phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,delivery=EXCLUDED.delivery,pickup=EXCLUDED.pickup,trade_name=EXCLUDED.trade_name,status='pending',verified=false,updated_at=now()`,
      [
        id,
        user.id,
        "family-" + id,
        value.name,
        value.description ?? existing?.description ?? "",
        value.cityId,
        value.neighborhood === undefined
          ? (existing?.neighborhood ?? null)
          : value.neighborhood,
        phone,
        value.whatsapp === undefined
          ? (existing?.whatsapp ?? null)
          : value.whatsapp
            ? normalizePhone(value.whatsapp)
            : null,
        delivery,
        pickup,
        value.tradeName === undefined
          ? (existing?.trade_name ?? null)
          : value.tradeName || null,
      ],
    );
    if (encrypted)
      await client.query(
        "INSERT INTO jdatna.producer_private(producer_id,encrypted_payload) VALUES($1,$2) ON CONFLICT(producer_id) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,updated_at=now()",
        [id, encrypted],
      );
    if (value.categoryIds !== undefined || !existing) {
      await client.query(
        "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
        [id],
      );
      for (const category of new Set(value.categoryIds ?? ["12"]))
        await client.query(
          "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
          [id, category],
        );
    }
    const previous = existing
      ? (
          await client.query(
            "SELECT document_id,document_type,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=$1 ORDER BY created_at DESC LIMIT 1",
            [id],
          )
        ).rows[0]
      : null;
    const sameDocument =
      previous?.document_id === value.documentId &&
      previous?.document_type === value.documentType;
    await client.query(
      "INSERT INTO jdatna.producer_verifications(id,producer_id,document_id,document_type,document_number,document_expires_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        id,
        value.documentId,
        value.documentType,
        value.documentNumber === undefined && sameDocument
          ? previous.document_number
          : (value.documentNumber ?? null),
        value.documentExpiresAt === undefined && sameDocument
          ? previous.document_expires_at
          : (value.documentExpiresAt ?? null),
        value.documentType === "exception" ? value.exceptionReason : null,
      ],
    );
    if (value.socialLinks !== undefined || value.website !== undefined) {
      let links =
        value.socialLinks ??
        (
          await client.query(
            "SELECT platform,url FROM jdatna.producer_social_links WHERE producer_id=$1",
            [id],
          )
        ).rows;
      if (value.website !== undefined) {
        links = links.filter(
          (link: { platform: string }) => link.platform !== "website",
        );
        if (value.website)
          links.push({ platform: "website", url: value.website });
      }
      await client.query(
        "DELETE FROM jdatna.producer_social_links WHERE producer_id=$1",
        [id],
      );
      for (const link of links)
        await client.query(
          "INSERT INTO jdatna.producer_social_links(producer_id,platform,url) VALUES($1,$2,$3)",
          [id, link.platform, link.url],
        );
    }
    if (value.businessHours !== undefined) {
      await client.query(
        "DELETE FROM jdatna.business_hours WHERE producer_id=$1",
        [id],
      );
      for (const hours of value.businessHours)
        await client.query(
          "INSERT INTO jdatna.business_hours(producer_id,day,opens,closes) VALUES($1,$2,$3,$4)",
          [id, hours.day, hours.opens, hours.closes],
        );
    }
    if (value.deliveryAreas !== undefined) {
      await client.query(
        "DELETE FROM jdatna.delivery_areas WHERE producer_id=$1",
        [id],
      );
      if (delivery)
        for (const area of value.deliveryAreas ?? [])
          await client.query(
            "INSERT INTO jdatna.delivery_areas(producer_id,city_id,fee) VALUES($1,$2,$3)",
            [id, area.cityId, area.fee],
          );
    }
    await client.query(
      "UPDATE jdatna.users SET role='producer' WHERE id=$1 AND role='customer'",
      [user.id],
    );
    return { id, status: "pending" };
  });
}
export async function ownProducts(user: SessionUser) {
  return (
    await db().query(
      `${productSelect} WHERE p.user_id=$1 ORDER BY x.created_at DESC`,
      [user.id],
    )
  ).rows.map(mapProduct);
}
export async function saveProduct(
  user: SessionUser,
  input: unknown,
  editing: boolean,
) {
  const value = productSchema.parse(input);
  if (editing && !value.id) throw new HttpError(400, "معرف المنتج مطلوب");
  return transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id,status FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (
      !producer ||
      producer.status === "suspended" ||
      producer.status === "rejected"
    )
      throw new HttpError(403, "لا يمكنك إدارة المنتجات قبل تقديم ملف صالح");
    const id = editing ? value.id! : randomUUID();
    if (editing) {
      const owned = (
        await client.query(
          "SELECT id FROM jdatna.products WHERE id=$1 AND producer_id=$2 FOR UPDATE",
          [id, producer.id],
        )
      ).rows[0];
      if (!owned) throw new HttpError(404, "المنتج غير موجود");
    }
    const args = [
      id,
      producer.id,
      value.name,
      value.description,
      value.price,
      value.unit,
      value.status,
      value.ingredients ?? null,
      value.storage ?? null,
      value.shelfLife ?? null,
      value.preparationTime ?? null,
      value.story ?? null,
    ];
    if (editing)
      await client.query(
        `UPDATE jdatna.products SET name=$3,description=$4,price=$5,unit=$6,status=$7,ingredients=$8,storage=$9,shelf_life=$10,preparation_time=$11,story=$12,updated_at=now() WHERE id=$1 AND producer_id=$2`,
        args,
      );
    else
      await client.query(
        `INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,ingredients,storage,shelf_life,preparation_time,story) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        args,
      );
    await client.query(
      "DELETE FROM jdatna.product_categories WHERE product_id=$1",
      [id],
    );
    for (const category of new Set(value.categoryIds))
      await client.query(
        "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
        [id, category],
      );
    await client.query(
      "DELETE FROM jdatna.product_allergens WHERE product_id=$1",
      [id],
    );
    for (const allergen of new Set(value.allergens))
      await client.query(
        "INSERT INTO jdatna.product_allergens(product_id,name) VALUES($1,$2)",
        [id, allergen],
      );
    return { id };
  });
}
export async function adminProducers(user: SessionUser) {
  if (user.role !== "admin")
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const profiles = (
    await db().query(
      `SELECT p.*,p.trade_name AS "tradeName",p.city_id AS "cityId",c.name AS "cityName",u.name AS "ownerName",v.document_id AS "documentId",v.document_type AS "documentType",v.reason AS "reviewReason",v.document_number AS "documentNumber",v.document_expires_at::text AS "documentExpiresAt",ARRAY(SELECT category_id FROM jdatna.producer_categories WHERE producer_id=p.id) AS "categoryIds" FROM jdatna.producer_profiles p JOIN jdatna.users u ON u.id=p.user_id JOIN jdatna.cities c ON c.id=p.city_id LEFT JOIN LATERAL(SELECT document_id,document_type,reason,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=p.id ORDER BY created_at DESC LIMIT 1)v ON true ORDER BY p.created_at DESC LIMIT 200`,
    )
  ).rows;
  if (!profiles.length) return profiles;
  const privateRows = (
    await db().query(
      "SELECT producer_id,encrypted_payload FROM jdatna.producer_private WHERE producer_id=ANY($1::uuid[])",
      [profiles.map((profile) => profile.id)],
    )
  ).rows;
  const data = new Map<string, ProducerPrivate>(
    privateRows.map((row) => [
      row.producer_id,
      decryptPrivate(row.encrypted_payload),
    ]),
  );
  return profiles.map((profile) => ({
    ...profile,
    nationalId: data.get(profile.id)?.nationalId ?? null,
    workLocation: data.get(profile.id)?.workLocation ?? null,
  }));
}
export async function reviewProducer(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  if (user.role !== "admin")
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const value = reviewSchema.parse(input);
  return transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id,user_id FROM jdatna.producer_profiles WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "الأسرة غير موجودة");
    if (producer.user_id === user.id)
      throw new HttpError(403, "لا يمكن مراجعة ملف أسرتك بنفسك");
    const verification = (
      await client.query(
        "SELECT *,document_expires_at<CURRENT_DATE AS expired FROM jdatna.producer_verifications WHERE producer_id=$1 ORDER BY created_at DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    if (value.decision === "approved" && verification?.expired === true)
      throw new HttpError(400, "المستند منتهي الصلاحية ويجب تحديثه");
    if (
      value.decision === "approved" &&
      !verification?.document_id &&
      !(
        verification?.document_type === "exception" &&
        value.exceptionApproved === true &&
        value.reason.length >= 10
      )
    )
      throw new HttpError(
        400,
        "يلزم مستند أهلية أو اعتماد استثناء إداري صريح بسبب موثق",
      );
    await client.query(
      "UPDATE jdatna.producer_profiles SET status=$2,verified=$3,updated_at=now() WHERE id=$1",
      [id, value.decision, value.decision === "approved"],
    );
    await client.query(
      "INSERT INTO jdatna.producer_verifications(id,producer_id,document_id,document_type,decision,reason,reviewer_id,eligibility_confirmed,document_number,document_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        randomUUID(),
        id,
        verification?.document_id ?? null,
        verification?.document_type ?? "exception",
        value.decision,
        value.reason,
        user.id,
        value.eligibilityConfirmed ?? false,
        verification?.document_number ?? null,
        verification?.document_expires_at ?? null,
      ],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), user.id, "producer.review", id, JSON.stringify(value)],
    );
    return { status: value.decision };
  });
}
