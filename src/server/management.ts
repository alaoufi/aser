import { z } from "zod";
import type { PoolClient } from "pg";
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
import { getProductFields } from "./settings";
import { siteTextDefaults } from "../lib/site-texts";
import { fieldShown } from "../lib/product-fields";
import { productSelect, mapProduct } from "./catalog";
import { can, canAny } from "../lib/permissions";
type ProducerPrivate = { nationalId: string; workLocation: string };
/**
 * رقم الهوية مطلوب دائمًا. وموقع العمل مطلوب فقط مع التسليم المباشر (قرار المالك 2026-11-27):
 * أسرة التوصيل وحده لا تُلزم بموقعها، فيُحفظ فارغًا.
 */
export function mergeProducerPrivate(
  existing: ProducerPrivate | null,
  input: { nationalId?: string; workLocation?: string },
  creating: boolean,
  needsLocation = true,
): ProducerPrivate | null {
  if (
    !creating &&
    !existing &&
    input.nationalId === undefined &&
    input.workLocation === undefined
  )
    return null;
  const nationalId = input.nationalId ?? existing?.nationalId,
    workLocation = input.workLocation ?? existing?.workLocation ?? "";
  if (!nationalId || (needsLocation && !workLocation))
    throw new HttpError(
      400,
      needsLocation
        ? "أدخل رقم الهوية ومكان مزاولة العمل للأسرة المنتجة"
        : "أدخل رقم الهوية للأسرة المنتجة",
    );
  return { nationalId, workLocation };
}
export function privateKey() {
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
      `SELECT p.*,p.trade_name AS "tradeName",p.city_id AS "cityId",p.user_id AS "userId",ARRAY(SELECT category_id FROM jdatna.producer_categories WHERE producer_id=p.id) AS "categoryIds",v.document_id AS "documentId",v.document_type AS "documentType",v.reason AS "reviewReason",v.document_number AS "documentNumber",v.document_expires_at::text AS "documentExpiresAt",p.delivery_scope AS "deliveryScope",p.shipping_fee::float8 AS "shippingFee",COALESCE((SELECT json_agg(json_build_object('platform',platform,'url',url)) FROM jdatna.producer_social_links WHERE producer_id=p.id),'[]') AS "socialLinks",COALESCE((SELECT json_agg(json_build_object('day',day,'opens',to_char(opens,'HH24:MI'),'closes',to_char(closes,'HH24:MI'))) FROM jdatna.business_hours WHERE producer_id=p.id),'[]') AS "businessHours",COALESCE((SELECT json_agg(json_build_object('cityId',city_id,'fee',fee)) FROM jdatna.delivery_areas WHERE producer_id=p.id),'[]') AS "deliveryAreas" FROM jdatna.producer_profiles p LEFT JOIN LATERAL(SELECT document_id,document_type,reason,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=p.id ORDER BY created_at DESC LIMIT 1)v ON true WHERE p.user_id=$1`,
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
type Query = { query: PoolClient["query"] };
/** يوحّد الاسم للمقارنة: بلا تشكيل وتطويل ومسافات زائدة، والهمزات والتاء المربوطة والألف المقصورة موحدة. */
const normalizedName = (column: string) =>
  `regexp_replace(regexp_replace(translate(lower(btrim(${column})),'أإآٱىة','اااايه'),'[\u064B-\u0652\u0640]','','g'),'\\s+',' ','g')`;
/**
 * الاسم المعلن لا يتكرر: يُقارن بالاسم الظاهر لكل أسرة أخرى (المعلن، أو الاسم إن لم يكن لها معلن).
 * القفل يمنع أسرتين من حجز الاسم نفسه في اللحظة نفسها.
 */
export const TRADE_NAME_TAKEN = "هذا الاسم مستخدم، اختر اسمًا آخر";
/** فحص فوري للاسم التجاري المعلن أثناء الكتابة (قبل الحفظ). */
export async function tradeNameAvailable(user: SessionUser, name: string) {
  const value = z.string().trim().min(2).max(120).safeParse(name);
  if (!value.success) return { available: false };
  const own = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0]?.id as string | undefined;
  const taken = (
    await db().query(
      `SELECT 1 FROM jdatna.producer_profiles
       WHERE ($2::uuid IS NULL OR id<>$2) AND ${normalizedName("COALESCE(trade_name,name)")}=${normalizedName("$1")}
       LIMIT 1`,
      [value.data, own ?? null],
    )
  ).rowCount;
  return taken
    ? { available: false, message: TRADE_NAME_TAKEN }
    : { available: true };
}
async function assertUniqueTradeName(
  client: Query,
  tradeName: string,
  ownId?: string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('jdatna.trade-name',0))",
  );
  const taken = (
    await client.query(
      `SELECT 1 FROM jdatna.producer_profiles
       WHERE ($2::uuid IS NULL OR id<>$2) AND ${normalizedName("COALESCE(trade_name,name)")}=${normalizedName("$1")}
       LIMIT 1`,
      [tradeName, ownId ?? null],
    )
  ).rowCount;
  if (taken) throw new HttpError(409, TRADE_NAME_TAKEN);
}
/**
 * يستبدل أقسام الأسرة. إزالة قسم عليه منتجات قائمة تحتاج تأكيدًا (removeProducts)،
 * فيُفصل المنتج عن القسم إن بقي له قسم آخر، ويُحذف (أرشفة) إن لم يبق له قسم.
 * المنتجات المحذوفة سابقًا لا تمنع الإزالة. منتجات الأسرة في الغالب وقتية لأيام.
 */
async function replaceProducerCategories(
  client: Query,
  producerId: string,
  categoryIds: string[],
  removeProducts = false,
) {
  const ids = [...new Set(categoryIds)];
  const known = (
    await client.query(
      "SELECT count(*)::int AS n FROM jdatna.categories WHERE id=ANY($1::text[])",
      [ids],
    )
  ).rows[0].n;
  if (known !== ids.length) throw new HttpError(400, "قسم غير موجود");
  const stranded = (
    await client.query(
      `SELECT x.id,x.name,c.name AS category,
         EXISTS(SELECT 1 FROM jdatna.product_categories o WHERE o.product_id=x.id AND o.category_id=ANY($2::text[])) AS kept
       FROM jdatna.product_categories pc
       JOIN jdatna.products x ON x.id=pc.product_id AND x.producer_id=$1 AND x.deleted_at IS NULL
       JOIN jdatna.categories c ON c.id=pc.category_id
       WHERE NOT pc.category_id=ANY($2::text[])`,
      [producerId, ids],
    )
  ).rows as { id: string; name: string; category: string; kept: boolean }[];
  const removed = stranded.filter((r) => !r.kept);
  if (removed.length && !removeProducts) {
    const categories = [...new Set(removed.map((r) => r.category))];
    const products = [...new Set(removed.map((r) => r.name))];
    throw new HttpError(
      409,
      `إزالة «${categories.join("، ")}» تحذف منتجاتك فيه: ${products.join("، ")}. هل تريد المتابعة؟`,
      { confirm: true, products: products.length },
    );
  }
  if (removed.length) {
    const gone = [...new Set(removed.map((r) => r.id))];
    await client.query(
      "UPDATE jdatna.products SET deleted_at=now(),visible=false,featured=false,updated_at=now() WHERE id=ANY($1::uuid[])",
      [gone],
    );
    await client.query(
      "UPDATE jdatna.offers SET enabled=false,updated_at=now() WHERE product_id=ANY($1::uuid[])",
      [gone],
    );
  }
  // روابط الأقسام المُزالة تُفك عن منتجات الأسرة (القائمة والمحذوفة)، فلا تبقى معلقة.
  await client.query(
    `DELETE FROM jdatna.product_categories pc USING jdatna.products x
     WHERE x.id=pc.product_id AND x.producer_id=$1 AND NOT pc.category_id=ANY($2::text[])
       AND (x.deleted_at IS NOT NULL OR EXISTS(SELECT 1 FROM jdatna.product_categories o WHERE o.product_id=x.id AND o.category_id=ANY($2::text[])))`,
    [producerId, ids],
  );
  await client.query(
    "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
    [producerId],
  );
  for (const category of ids)
    await client.query(
      "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
      [producerId, category],
    );
}
/** تغيير أقسام الأسرة بعد التسجيل لا يعيد الملف للمراجعة. */
export async function saveProducerCategories(
  user: SessionUser,
  input: unknown,
) {
  const { categoryIds, removeProducts } = z
    .object({
      categoryIds: z.array(z.string().min(1).max(30)).min(1).max(100),
      /** تأكيد الأسرة حذف منتجاتها في الأقسام التي تزيلها. */
      removeProducts: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
    await replaceProducerCategories(
      client,
      producer.id,
      categoryIds,
      removeProducts === true,
    );
    return { categoryIds: [...new Set(categoryIds)] };
  });
}
/** تنبيه المشرفين (المدير ومن له صلاحية الأسر) بأسرة تنتظر الاعتماد. لا يُفشل الحفظ إن تعذر. */
export async function notifyApprovers(
  familyName: string,
  body = `«${familyName}» سجّلت وتنتظر الاعتماد.`,
  title = "أسرة تنتظر الاعتماد",
) {
  try {
    const { notifyUser } = await import("./push");
    const approvers = (
      await db().query(
        "SELECT id FROM jdatna.users WHERE role='admin' OR 'approvals'=ANY(permissions)",
      )
    ).rows as { id: string }[];
    await Promise.all(
      approvers.map((a) =>
        notifyUser(a.id, {
          title,
          body,
          url: "/admin?tab=approvals",
          tag: "family-approval",
        }),
      ),
    );
  } catch {}
}
export async function saveProfile(user: SessionUser, input: unknown) {
  const saved = await saveProfileRecord(user, input);
  if (saved.newlyPending) void notifyApprovers(saved.name);
  if (saved.pledged)
    void notifyApprovers(
      saved.name,
      `«${saved.name}» سجّلت وتعهدت بتقديم المستندات خلال 15 يومًا، وظهرت للعملاء.`,
      "أسرة جديدة بتعهد المستندات",
    );
  if (saved.newDocument)
    void notifyApprovers(
      saved.name,
      `«${saved.name}» رفعت مستندًا جديدًا للمراجعة.`,
      "مستند أسرة للمراجعة",
    );
  return { id: saved.id, status: saved.status };
}
async function saveProfileRecord(user: SessionUser, input: unknown) {
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
    // أسرة أوقفتها الإدارة لا تعيد نفسها «بانتظار الاعتماد» بتعديل ملفها (مراجعة 2026-11-24).
    if (existing?.status === "suspended")
      throw new HttpError(
        403,
        "أوقفت الإدارة حساب الأسرة، فلا يُعدَّل ملفها. تواصل مع الدعم",
      );
    if (!existing && !value.categoryIds?.length)
      throw new HttpError(400, "اختر قسمًا واحدًا على الأقل لمنتجاتك");
    if (!existing && !value.tradeName)
      throw new HttpError(400, "اكتب الاسم التجاري المعلن للأسرة");
    if (value.tradeName)
      await assertUniqueTradeName(client, value.tradeName, existing?.id);
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
        pickup,
      );
      if (data)
        encrypted = encryptDocument(
          Buffer.from(JSON.stringify({ version: 1, ...data })),
          privateKey(),
        );
    }
    // آخر مستند أهلية قبل هذا الحفظ: تغييره يعيد الأسرة للمراجعة.
    const previous = existing
      ? (
          await client.query(
            "SELECT document_id,document_type,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=$1 ORDER BY created_at DESC LIMIT 1",
            [id],
          )
        ).rows[0]
      : null;
    // بلا مستند (null) في المرتين يُعدّ المستند نفسه.
    const sameDocument =
      Boolean(previous) &&
      (previous.document_id ?? null) === (value.documentId ?? null) &&
      (previous.document_type ?? null) === (value.documentType ?? null);
    // قرار المالك 2026-11-24: الأسرة المعتمدة تبقى ظاهرة بتعديلاتها العادية (الوصف، الجوال، الحي،
    // طرق التسليم...). تغيير الاسم التجاري أو مستند الأهلية فقط يعيدها «بانتظار الاعتماد».
    // كانت كل تعديلات الملف تعيدها للمراجعة فتختفي من الموقع حتى يعيد المشرف اعتمادها.
    const sameTradeName =
      value.tradeName === undefined ||
      (value.tradeName ?? "").trim() === (existing?.trade_name ?? "").trim();
    // قرار المالك 2026-11-26: المستند لا يُخفي الأسرة المعتمدة؛ تبقى ظاهرة وتراجعه الإدارة حين يصل.
    // تغيير الاسم التجاري وحده يعيدها للمراجعة (قرار 2026-11-24).
    const keepApproved = existing?.status === "approved" && sameTradeName;
    // التعهد بالمستندات خلال 15 يومًا يعطي كل صلاحيات الأسرة فورًا: للتسجيل الجديد، أو لطلب
    // ما زال بانتظار الاعتماد ولم يُعتمد قبل. لا يتجاوز مراجعة تغيير الاسم لأسرة اعتُمدت سابقًا.
    const everApproved =
      Boolean(existing) &&
      Boolean(
        (
          await client.query(
            "SELECT 1 FROM jdatna.producer_verifications WHERE producer_id=$1 AND decision='approved' LIMIT 1",
            [id],
          )
        ).rowCount,
      );
    const autoApprove =
      value.pledge === true &&
      !keepApproved &&
      (!existing || (existing.status === "pending" && !everApproved));
    await client.query(
      `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,description,city_id,neighborhood,phone,whatsapp,delivery,pickup,trade_name,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $14 THEN 'approved' ELSE 'pending' END) ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,city_id=EXCLUDED.city_id,neighborhood=EXCLUDED.neighborhood,phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,delivery=EXCLUDED.delivery,pickup=EXCLUDED.pickup,trade_name=EXCLUDED.trade_name,
        status=CASE WHEN $13 THEN jdatna.producer_profiles.status WHEN $14 THEN 'approved' ELSE 'pending' END,
        verified=CASE WHEN $13 THEN jdatna.producer_profiles.verified ELSE false END,updated_at=now()`,
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
          : value.tradeName,
        keepApproved,
        autoApprove,
      ],
    );
    if (autoApprove)
      await client.query(
        "UPDATE jdatna.producer_profiles SET docs_pledged_at=COALESCE(docs_pledged_at,now()),docs_due_at=COALESCE(docs_due_at,now()+interval '15 days') WHERE id=$1",
        [id],
      );
    // رفعت المستند والمنتجات مخفية لتأخره: تعود كما كانت (قرار المالك 2026-11-26).
    if (value.documentId && !sameDocument && existing?.docs_hidden_at)
      await restoreDocsHold(client, id);
    if (encrypted)
      await client.query(
        "INSERT INTO jdatna.producer_private(producer_id,encrypted_payload) VALUES($1,$2) ON CONFLICT(producer_id) DO UPDATE SET encrypted_payload=EXCLUDED.encrypted_payload,updated_at=now()",
        [id, encrypted],
      );
    if (value.categoryIds !== undefined)
      await replaceProducerCategories(client, id, value.categoryIds);
    // نطاق التوصيل الافتراضي للأسرة (يُقترح لكل منتج جديد).
    if (value.deliveryScope !== undefined)
      await client.query(
        "UPDATE jdatna.producer_profiles SET delivery_scope=$2,shipping_fee=$3 WHERE id=$1",
        [
          id,
          value.deliveryScope,
          value.deliveryScope === "kingdom"
            ? (value.shippingFee ?? null)
            : null,
        ],
      );
    await client.query(
      "INSERT INTO jdatna.producer_verifications(id,producer_id,document_id,document_type,document_number,document_expires_at,reason,decision) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN 'approved' ELSE 'pending' END)",
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
        // الاعتماد بالتعهد يُسجَّل اعتمادًا (تاريخه «تاريخ الاعتماد»)؛ وغيره كما كان.
        autoApprove,
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
    return {
      id,
      status:
        keepApproved || autoApprove
          ? ("approved" as const)
          : ("pending" as const),
      name: (value.tradeName || value.name) as string,
      // ينبّه المشرفين حين يدخل الملف قائمة الانتظار، لا مع كل تعديل وهو فيها.
      newlyPending:
        !keepApproved &&
        !autoApprove &&
        (!existing || existing.status !== "pending"),
      pledged: autoApprove,
      // مستند جديد من أسرة معتمدة: تراجعه الإدارة دون إخفاء الأسرة.
      newDocument: keepApproved && !sameDocument && Boolean(value.documentId),
    };
  });
}
const fulfillmentSchema = z
  .object({
    pickup: z.boolean(),
    delivery: z.boolean(),
    pickupLocation: z.string().trim().max(1000).nullable().optional(),
    /** موقع الأسرة معلن في صفحتها العامة (نعم/لا). */
    locationPublic: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.pickup || v.delivery, {
    message: "اختر التسليم المباشر أو التوصيل، أو كليهما",
  })
  .refine((v) => !v.pickup || (v.pickupLocation ?? "").length >= 5, {
    message: "حدد موقع التسليم المباشر: العنوان أو رابط الخرائط",
  })
  .refine((v) => !v.pickupLocation || v.pickupLocation.length >= 5, {
    message: "اكتب موقع الأسرة كاملًا: العنوان أو رابط الخرائط",
  });
/** طرق التسليم في لوحة الأسرة. تعديلها لا يعيد الملف للمراجعة. */
export async function ownFulfillment(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT pickup,delivery,pickup_location AS "pickupLocation",show_location AS "locationPublic" FROM jdatna.producer_profiles WHERE user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return row as {
    pickup: boolean;
    delivery: boolean;
    pickupLocation: string | null;
    locationPublic: boolean;
  };
}
export async function saveFulfillment(user: SessionUser, input: unknown) {
  const v = fulfillmentSchema.parse(input);
  const row = (
    await db().query(
      `UPDATE jdatna.producer_profiles SET pickup=$2,delivery=$3,pickup_location=$4,show_location=$5,updated_at=now() WHERE user_id=$1
       RETURNING pickup,delivery,pickup_location AS "pickupLocation",show_location AS "locationPublic"`,
      // موقع الأسرة يُحفظ دائمًا إن كُتب: للتسليم المباشر، ولاستلام المندوب في التوصيل.
      [
        user.id,
        v.pickup,
        v.delivery,
        v.pickupLocation || null,
        v.locationPublic && Boolean(v.pickupLocation),
      ],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return row;
}
const contactSchema = z
  .object({ showPhone: z.boolean(), showWhatsapp: z.boolean() })
  .strict();
/** ظهور بيانات التواصل للعملاء (جوال، واتساب). تعديله لا يعيد الملف للمراجعة. */
export async function ownContactVisibility(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT show_phone AS "showPhone",show_whatsapp AS "showWhatsapp",phone,NULLIF(whatsapp,'') AS whatsapp FROM jdatna.producer_profiles WHERE user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return row as {
    showPhone: boolean;
    showWhatsapp: boolean;
    phone: string;
    whatsapp: string | null;
  };
}
export async function saveContactVisibility(user: SessionUser, input: unknown) {
  const v = contactSchema.parse(input);
  const r = await db().query(
    "UPDATE jdatna.producer_profiles SET show_phone=$2,show_whatsapp=$3,updated_at=now() WHERE user_id=$1",
    [user.id, v.showPhone, v.showWhatsapp],
  );
  if (!r.rowCount) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return ownContactVisibility(user);
}
/** عدد الأسر التي تنتظر الاعتماد: لتبويب «اعتماد الأسر المنتجة» وتنبيه المشرفين. */
export async function pendingApprovals(user: SessionUser) {
  if (!canAny(user, "approvals", "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const row = (
    await db().query(
      // الأسر والمندوبون بانتظار الاعتماد معًا.
      `SELECT (SELECT count(*) FROM jdatna.producer_profiles WHERE status='pending')
         +(SELECT count(*) FROM jdatna.courier_profiles WHERE status='pending') AS count`,
    )
  ).rows[0];
  return { count: Number(row.count) };
}
export async function ownProducts(user: SessionUser) {
  return (
    await db().query(
      `${productSelect.replace("SELECT ", 'SELECT x.visible,x.hidden_by AS "hiddenBy",')} WHERE p.user_id=$1 AND x.deleted_at IS NULL ORDER BY x.created_at DESC`,
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
  if (
    value.description.length < 5 &&
    fieldShown(await getProductFields(), "description")
  )
    throw new HttpError(400, "اكتب تفاصيل المنتج في خمسة أحرف على الأقل");
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
    const chosen = new Set(
      (
        await client.query(
          "SELECT category_id FROM jdatna.producer_categories WHERE producer_id=$1",
          [producer.id],
        )
      ).rows.map((r) => r.category_id as string),
    );
    if (value.categoryIds.some((c) => !chosen.has(c)))
      throw new HttpError(
        400,
        "اختر للمنتج من أقسامك فقط؛ أضف القسم لأقسامك أولًا من لوحة الأسرة",
      );
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
        `UPDATE jdatna.products SET name=$3,description=$4,price=$5,unit=$6,status=$7,ingredients=$8,storage=$9,shelf_life=$10,preparation_time=$11,story=$12,updated_at=now() WHERE id=$1 AND producer_id=$2 AND deleted_at IS NULL`,
        args,
      );
    else
      // منتج جديد أثناء إخفاء المنتجات لتأخر المستندات يُخفى مثلها، ويعود معها.
      await client.query(
        `INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,ingredients,storage,shelf_life,preparation_time,story,visible,hidden_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,p.docs_hidden_at IS NULL,CASE WHEN p.docs_hidden_at IS NULL THEN NULL ELSE 'docs' END
         FROM jdatna.producer_profiles p WHERE p.id=$2`,
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
    // نطاق توصيل المنتج: ما اختارته الأسرة له، وإلا افتراضي الأسرة للمنتج الجديد.
    if (value.deliveryScope !== undefined)
      await client.query(
        "UPDATE jdatna.products SET delivery_scope=$2,shipping_fee=$3 WHERE id=$1",
        [
          id,
          value.deliveryScope,
          value.deliveryScope === "kingdom"
            ? (value.shippingFee ?? null)
            : null,
        ],
      );
    else if (!editing)
      await client.query(
        "UPDATE jdatna.products x SET delivery_scope=p.delivery_scope,shipping_fee=p.shipping_fee FROM jdatna.producer_profiles p WHERE x.id=$1 AND p.id=x.producer_id",
        [id],
      );
    if (value.libraryPhotoId) {
      const owned = (
        await client.query(
          "SELECT 1 FROM jdatna.photo_library WHERE id=$1 AND producer_id=$2",
          [value.libraryPhotoId, producer.id],
        )
      ).rowCount;
      if (!owned) throw new HttpError(400, "اختر صورة من مكتبة صورك");
      await client.query(
        "UPDATE jdatna.products SET image_url=$2 WHERE id=$1",
        [id, "/api/media/" + value.libraryPhotoId],
      );
    }
    return { id };
  });
}
export async function adminProducers(user: SessionUser) {
  if (!canAny(user, "approvals", "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const profiles = (
    await db().query(
      `SELECT p.*,p.trade_name AS "tradeName",p.city_id AS "cityId",c.name AS "cityName",u.name AS "ownerName",p.docs_due_at AS "docsDueAt",p.docs_hidden_at AS "docsHiddenAt",v.document_id AS "documentId",v.document_type AS "documentType",v.reason AS "reviewReason",v.document_number AS "documentNumber",v.document_expires_at::text AS "documentExpiresAt",p.docs_status AS "docsStatus",ARRAY(SELECT category_id FROM jdatna.producer_categories WHERE producer_id=p.id) AS "categoryIds" FROM jdatna.producer_profiles p JOIN jdatna.users u ON u.id=p.user_id JOIN jdatna.cities c ON c.id=p.city_id LEFT JOIN LATERAL(SELECT document_id,document_type,reason,document_number,document_expires_at FROM jdatna.producer_verifications WHERE producer_id=p.id ORDER BY created_at DESC LIMIT 1)v ON true ORDER BY (p.status='pending') DESC,(p.status='rejected') DESC,p.created_at DESC LIMIT 200`,
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
/**
 * «مستندات الأسر» في الإدارة (قرار المالك 2026-11-27): كل مستندات كل أسرة، الأحدث أولًا، مع بيانات
 * المراجعة إن وُجدت (النوع والرقم والانتهاء والقرار). الملف نفسه يُفتح من /api/documents/{id} ويُسجَّل فتحه.
 */
export async function adminDocuments(user: SessionUser, q = "") {
  if (!canAny(user, "approvals", "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const term = q.trim().slice(0, 80);
  return (
    await db().query(
      `SELECT d.id,d.type,d.mime,d.size,d.created_at AS "createdAt",
              p.id AS "producerId",COALESCE(p.trade_name,p.name,u.name) AS "familyName",p.slug,p.status AS "familyStatus",
              u.member_no AS "memberNo",
              v.document_type AS "documentType",v.document_number AS "documentNumber",
              v.document_expires_at::text AS "expiresAt",v.decision
         FROM jdatna.producer_documents d
         JOIN jdatna.users u ON u.id=d.user_id
         LEFT JOIN jdatna.producer_profiles p ON p.user_id=d.user_id
         LEFT JOIN LATERAL (SELECT document_type,document_number,document_expires_at,decision
                              FROM jdatna.producer_verifications
                             WHERE document_id=d.id ORDER BY created_at DESC LIMIT 1) v ON true
        WHERE ($1='' OR COALESCE(p.trade_name,p.name,u.name) ILIKE '%'||$1||'%' OR u.member_no::text=$1)
        ORDER BY d.created_at DESC LIMIT 500`,
      [term],
    )
  ).rows as {
    id: string;
    type: string;
    mime: string;
    size: number;
    createdAt: string;
    producerId: string | null;
    familyName: string;
    slug: string | null;
    familyStatus: string | null;
    memberNo: number | null;
    documentType: string | null;
    documentNumber: string | null;
    expiresAt: string | null;
    decision: string | null;
  }[];
}
export async function reviewProducer(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  if (!canAny(user, "approvals", "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const value = reviewSchema.parse(input);
  // «مكتمل الشروط» و«مستثنى من الشروط» تفعيل للحساب بعلامة تحفظ نوعه.
  const status = ["complete", "exempt"].includes(value.decision)
    ? "approved"
    : (value.decision as "approved" | "rejected" | "suspended");
  const docsStatus =
    value.decision === "complete" || value.decision === "exempt"
      ? value.decision
      : null;
  const result = await transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id,user_id,status FROM jdatna.producer_profiles WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "الأسرة المنتجة غير موجودة");
    // المدير الكامل صلاحياته مطلقة (قرار المالك 2026-11-16): يعتمد أسرته بنفسه.
    // المشرف بصلاحية محدودة لا يراجع ملف أسرته.
    if (producer.user_id === user.id && user.role !== "admin")
      throw new HttpError(403, "لا يمكن مراجعة ملف أسرتك بنفسك");
    const verification = (
      await client.query(
        "SELECT *,document_expires_at<CURRENT_DATE AS expired FROM jdatna.producer_verifications WHERE producer_id=$1 ORDER BY created_at DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    if (value.decision === "approved" && verification?.expired === true)
      throw new HttpError(400, "المستند منتهي الصلاحية ويجب تحديثه");
    // المكتمل والمستثنى: لا مهلة مستندات ولا تنبيه تأخر، والمنتجات المخفية لتأخر المستندات تعود.
    if (docsStatus) {
      await client.query(
        "UPDATE jdatna.producer_profiles SET docs_due_at=NULL,docs_late_notified_at=NULL WHERE id=$1",
        [id],
      );
      await restoreDocsHold(client, id);
    }
    // المباركة لأول اعتماد فقط؛ إعادة الاعتماد بعد تعديل البيانات لا تكررها.
    const approvedBefore = Boolean(
      (
        await client.query(
          "SELECT 1 FROM jdatna.producer_verifications WHERE producer_id=$1 AND decision='approved' LIMIT 1",
          [id],
        )
      ).rowCount,
    );
    // تفعيل الإدارة لا يشترط مستندًا (قرار المالك 2026-11-14)؛ الحساب دون مستند «نشط» لا «موثوق»،
    // وملاحظة القرار تظهر للأسرة بالنواقص.
    await client.query(
      "UPDATE jdatna.producer_profiles SET status=$2,verified=$3,docs_status=$4,updated_at=now() WHERE id=$1",
      [id, status, status === "approved", docsStatus],
    );
    await client.query(
      "INSERT INTO jdatna.producer_verifications(id,producer_id,document_id,document_type,decision,reason,reviewer_id,eligibility_confirmed,document_number,document_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        randomUUID(),
        id,
        verification?.document_id ?? null,
        verification?.document_type ?? "exception",
        status,
        value.reason || (docsStatus === "complete" ? "مكتمل الشروط" : null),
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
    return {
      status,
      docsStatus,
      congratulate:
        status === "approved" &&
        producer.status !== "approved" &&
        !approvedBefore
          ? (producer.user_id as string)
          : null,
    };
  });
  // مباركة الاعتماد للأسرة (نصها من «نصوص الموقع»)، وتظهر كذلك أعلى لوحتها.
  if (result.congratulate) {
    const { getSiteTexts } = await import("./settings");
    const { notifyUser } = await import("./push");
    const texts = await getSiteTexts().catch(() => null);
    void notifyUser(result.congratulate, {
      title: texts?.["approval.title"] || siteTextDefaults["approval.title"],
      body: texts?.["approval.message"] || siteTextDefaults["approval.message"],
      url: "/dashboard",
      tag: "family-approved",
    });
  }
  return { status: result.status };
}
// حالة حساب الأسرة المنتجة للشريط أعلى الصفحة: بيانات المالك فقط، دون بيانات خاصة.
export async function familyStatus(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT p.status,p.verified,p.slug,p.docs_status AS "docsStatus",(SELECT max(created_at) FROM jdatna.producer_verifications WHERE producer_id=p.id AND decision='approved')::text AS "approvedAt",v.document_id AS "documentId",v.document_type AS "documentType",v.document_expires_at::text AS "documentExpiresAt",v.reason AS "reviewReason"
       FROM jdatna.producer_profiles p
       LEFT JOIN LATERAL(SELECT document_id,document_type,document_expires_at,reason FROM jdatna.producer_verifications WHERE producer_id=p.id ORDER BY created_at DESC LIMIT 1)v ON true
       WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  return row ?? null;
}

/**
 * الأسرة تخفي منتجها أو تظهره أو تحذفه. الحذف أرشفة: يختفي نهائيًا من الأسرة والزوار
 * وتبقى سجلات طلباته، وتتوقف عروضه. إخفاء الإدارة لا تلغيه الأسرة.
 */
export async function manageProduct(user: SessionUser, input: unknown) {
  const { id, action } = z
    .object({ id: z.uuid(), action: z.enum(["hide", "show", "delete"]) })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    const product = (
      await client.query(
        `SELECT x.id,x.visible,x.hidden_by FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
         WHERE x.id=$1 AND p.user_id=$2 AND x.deleted_at IS NULL FOR UPDATE OF x`,
        [id, user.id],
      )
    ).rows[0] as
      { id: string; visible: boolean; hidden_by: string | null } | undefined;
    if (!product) throw new HttpError(404, "المنتج غير موجود");
    if (action === "delete") {
      await client.query(
        "UPDATE jdatna.products SET deleted_at=now(),visible=false,featured=false,updated_at=now() WHERE id=$1",
        [id],
      );
      await client.query(
        "UPDATE jdatna.offers SET enabled=false,updated_at=now() WHERE product_id=$1",
        [id],
      );
      return { id, deleted: true };
    }
    if (product.hidden_by === "admin")
      throw new HttpError(403, "أخفت الإدارة هذا المنتج؛ تواصل معها لإظهاره");
    if (product.hidden_by === "docs")
      throw new HttpError(
        403,
        "منتجاتك مخفية حتى ترفع المستندات الرسمية من «هوية الأسرة» ← «بيانات الأسرة»، فتعود كما كانت",
      );
    await client.query(
      `UPDATE jdatna.products SET visible=$2,hidden_by=$3,updated_at=now() WHERE id=$1`,
      [id, action === "show", action === "show" ? null : "family"],
    );
    return { id, visible: action === "show" };
  });
}

/**
 * قرار المالك 2026-11-26: الأسرة المتعهدة بالمستندات إذا مضت 15 يومًا دون رفعها، تُنبَّه الإدارة
 * (مرة لكل أسرة) وتبقى الأسرة ظاهرة. يعمل مع الصيانة الدورية (scripts/cleanup-auth.ts).
 */
export async function notifyLateDocuments(limit = 50) {
  const late = (
    await db().query<{ id: string; name: string }>(
      `UPDATE jdatna.producer_profiles p SET docs_late_notified_at=now()
       WHERE p.id IN (
         SELECT x.id FROM jdatna.producer_profiles x
         WHERE x.docs_due_at<now() AND x.docs_late_notified_at IS NULL AND x.status='approved' AND x.docs_status IS NULL
           AND NOT EXISTS(SELECT 1 FROM jdatna.producer_verifications v WHERE v.producer_id=x.id AND v.document_id IS NOT NULL)
         ORDER BY x.docs_due_at LIMIT $1)
       RETURNING p.id,p.user_id AS "userId",COALESCE(p.trade_name,p.name) AS name`,
      [limit],
    )
  ).rows as { id: string; userId: string; name: string }[];
  const { notifyUser } = await import("./push");
  for (const f of late) {
    // الأسرة نفسها تُنبَّه أيضًا (قرار المالك 2026-11-26).
    await notifyUser(f.userId, {
      title: "انتهت مهلة المستندات",
      body: "مضت 15 يومًا على تعهدك. ارفع المستندات الرسمية لممارسة النشاط من «هوية الأسرة» ← «بيانات الأسرة».",
      url: "/dashboard/identity",
      tag: "family-docs",
    }).catch(() => {});
    await notifyApprovers(
      f.name,
      `«${f.name}» مضت 15 يومًا على تعهدها ولم ترفع المستندات الرسمية. تجدها في «تأخرت في المستندات».`,
      "أسرة تأخرت في المستندات",
    );
  }
  return late.length;
}

/** يعيد منتجات الأسرة المخفية لتأخر المستندات كما كانت. */
async function restoreDocsHold(client: PoolClient, producerId: string) {
  await client.query(
    "UPDATE jdatna.products SET visible=true,hidden_by=NULL,updated_at=now() WHERE producer_id=$1 AND hidden_by='docs' AND deleted_at IS NULL",
    [producerId],
  );
  await client.query(
    "UPDATE jdatna.producer_profiles SET docs_hidden_at=NULL WHERE id=$1",
    [producerId],
  );
}

const docsActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("extend"),
      days: z.union([z.literal(7), z.literal(15), z.literal(30)]),
    })
    .strict(),
  z.object({ action: z.literal("hide") }).strict(),
  z.object({ action: z.literal("show") }).strict(),
]);

/**
 * مهلة المستندات (قرار المالك 2026-11-26): بعد انتهائها تختار الإدارة «تمديد» (7 أو 15 أو 30 يومًا،
 * وتعود المنتجات إن كانت مخفية)، أو «إخفاء المنتجات حتى رفع المستندات» (الظاهرة منها فقط، فتعود كما
 * كانت عند رفع المستند)، أو «إظهار المنتجات». الأسرة تُنبَّه بكل قرار.
 */
export async function producerDocsAction(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  if (!canAny(user, "approvals", "producers"))
    throw new HttpError(403, "لا تملك صلاحية المراجعة");
  const v = docsActionSchema.parse(input);
  const result = await transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id,user_id,docs_due_at FROM jdatna.producer_profiles WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0] as
      { id: string; user_id: string; docs_due_at: Date | null } | undefined;
    if (!producer) throw new HttpError(404, "الأسرة المنتجة غير موجودة");
    if (!producer.docs_due_at)
      throw new HttpError(400, "هذه الأسرة لم تتعهد بتقديم المستندات");
    let hidden = 0;
    if (v.action === "extend") {
      await client.query(
        "UPDATE jdatna.producer_profiles SET docs_due_at=now()+make_interval(days=>$2),docs_late_notified_at=NULL WHERE id=$1",
        [id, v.days],
      );
      await restoreDocsHold(client, id);
    } else if (v.action === "hide") {
      hidden =
        (
          await client.query(
            "UPDATE jdatna.products SET visible=false,hidden_by='docs',updated_at=now() WHERE producer_id=$1 AND visible AND deleted_at IS NULL",
            [id],
          )
        ).rowCount ?? 0;
      await client.query(
        "UPDATE jdatna.producer_profiles SET docs_hidden_at=COALESCE(docs_hidden_at,now()) WHERE id=$1",
        [id],
      );
    } else await restoreDocsHold(client, id);
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), user.id, "producer.docs", id, JSON.stringify(v)],
    );
    const after = (
      await client.query(
        'SELECT docs_due_at AS "docsDueAt",docs_hidden_at AS "docsHiddenAt" FROM jdatna.producer_profiles WHERE id=$1',
        [id],
      )
    ).rows[0];
    return { userId: producer.user_id, hidden, ...after };
  });
  try {
    const { notifyUser } = await import("./push");
    const due = result.docsDueAt
      ? new Date(result.docsDueAt).toLocaleDateString("ar-SA-u-nu-latn", {
          timeZone: "Asia/Riyadh",
        })
      : "";
    await notifyUser(result.userId, {
      title:
        v.action === "extend"
          ? "مُدّدت مهلة المستندات"
          : v.action === "hide"
            ? "أُخفيت منتجاتك حتى رفع المستندات"
            : "عادت منتجاتك ظاهرة",
      body:
        v.action === "extend"
          ? `ارفع المستندات الرسمية لممارسة النشاط قبل ${due}.`
          : v.action === "hide"
            ? "ارفع المستندات الرسمية من «هوية الأسرة» ← «بيانات الأسرة»، فتعود منتجاتك كما كانت."
            : "أعادت الإدارة منتجاتك ظاهرة للعملاء.",
      url: "/dashboard/identity",
      tag: "family-docs",
    });
  } catch {}
  return {
    docsDueAt: result.docsDueAt,
    docsHiddenAt: result.docsHiddenAt,
    hidden: result.hidden,
  };
}
