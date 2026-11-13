import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";

/**
 * مراجعة المتاجر (Apple وGoogle، رفض Guideline 2.1): حسابا مراجعة يدخلان بكلمة مرور
 * يختارها المالك من الإدارة (لا تُحفظ في المستودع)، وأسرة تجريبية لا تظهر في القوائم العامة،
 * ورقم ثالث لعرض إنشاء حساب جديد ثم حذفه.
 *
 * رمز SMS لا يُرسل لأرقام المراجعة أبدًا (ليست أرقامنا). وأثناء «وضع المراجعة» فقط
 * يقبل التحقق الرمز الثابت لها، ويُغلق الوضع تلقائيًا بانتهاء مدته. باقي المستخدمين
 * لا يتغير عليهم شيء: رمز SMS لهم كما هو.
 */
export const REVIEW = {
  client: {
    username: "apple_review_client",
    phone: "+966500000001",
    name: "مراجع المتجر",
  },
  family: {
    username: "apple_review_family",
    phone: "+966500000002",
    name: "أسرة المراجعة",
  },
  /** رقم لعرض «إنشاء حساب جديد» ثم «حذف الحساب» في مقطع المراجعة. */
  signupPhone: "+966500000003",
  code: "1234",
  familySlug: "apple-review-family",
} as const;
const REVIEW_PHONES: string[] = [
  REVIEW.client.phone,
  REVIEW.family.phone,
  REVIEW.signupPhone,
];
const SETTING = "store_review";

export function isReviewPhone(phone: string) {
  return REVIEW_PHONES.includes(phone);
}

/** نهاية «وضع المراجعة» إن كان مفتوحًا الآن، وإلا null. */
export async function reviewWindowUntil(
  runner: Pick<PoolClient, "query"> = db(),
): Promise<string | null> {
  const row = (
    await runner.query(
      "SELECT value->>'until' AS until FROM jdatna.platform_settings WHERE key=$1",
      [SETTING],
    )
  ).rows[0];
  const until = row?.until as string | undefined;
  return until && new Date(until).getTime() > Date.now() ? until : null;
}

/**
 * التحقق بالجوال لأرقام المراجعة: يرفض خارج «وضع المراجعة»، وداخله يعيد الرمز الثابت
 * بدل إرسال رسالة. لغير أرقام المراجعة يعيد null فيبقى المسار العادي كما هو.
 */
export async function reviewOtpCode(phone: string) {
  if (!isReviewPhone(phone)) return null;
  // حسابا المراجعة يدخلان بكلمة المرور فقط؛ فلا يغيّر أحد كلمتهما برمز التحقق.
  if (phone !== REVIEW.signupPhone)
    throw new HttpError(403, "حسابات المراجعة تدخل بكلمة المرور");
  if (!(await reviewWindowUntil()))
    throw new HttpError(
      403,
      "هذا الرقم مخصص لمراجعة المتاجر، ووضع المراجعة مغلق",
    );
  return REVIEW.code;
}

/**
 * حساب المراجعة يتعامل مع الأسرة التجريبية فقط، والأسرة التجريبية لا يطلب منها
 * ولا يراسلها إلا حساب مراجعة؛ فلا يصل المراجع إلى أسرة حقيقية ولا العكس.
 */
export async function assertReviewPair(
  runner: Pick<PoolClient, "query">,
  userId: string,
  producerId: string,
) {
  const row = (
    await runner.query(
      `SELECT u.review_account AS "reviewer",p.review_only AS "reviewOnly"
       FROM jdatna.users u, jdatna.producer_profiles p WHERE u.id=$1 AND p.id=$2`,
      [userId, producerId],
    )
  ).rows[0] as { reviewer: boolean; reviewOnly: boolean } | undefined;
  if (row && row.reviewer !== row.reviewOnly)
    throw new HttpError(
      403,
      row.reviewer
        ? "حساب المراجعة يتعامل مع أسرة المراجعة فقط"
        : "الأسرة المنتجة غير متاحة",
    );
}

function owner(user: SessionUser) {
  if (user.role !== "admin")
    throw new HttpError(403, "حسابات المراجعة لمدير المنصة فقط");
}

export type ReviewStatus = {
  until: string | null;
  client: boolean;
  family: boolean;
  familySlug: string;
  usernames: { client: string; family: string };
  phones: { client: string; family: string; signup: string };
  code: string;
};

export async function reviewStatus(user: SessionUser): Promise<ReviewStatus> {
  owner(user);
  const [until, users] = await Promise.all([
    reviewWindowUntil(),
    db().query(
      "SELECT username FROM jdatna.users WHERE username=ANY($1) AND deleted_at IS NULL AND password_hash IS NOT NULL",
      [[REVIEW.client.username, REVIEW.family.username]],
    ),
  ]);
  const names = users.rows.map((r) => r.username as string);
  return {
    until,
    client: names.includes(REVIEW.client.username),
    family: names.includes(REVIEW.family.username),
    familySlug: REVIEW.familySlug,
    usernames: {
      client: REVIEW.client.username,
      family: REVIEW.family.username,
    },
    phones: {
      client: REVIEW.client.phone,
      family: REVIEW.family.phone,
      signup: REVIEW.signupPhone,
    },
    code: REVIEW.code,
  };
}

const setupSchema = z
  .object({
    password: z
      .string()
      .min(8, "كلمة مرور المراجعة ثمانية أحرف على الأقل")
      .max(128)
      .optional(),
    days: z.number().int().min(0).max(30),
  })
  .strict();

async function upsertUser(
  client: PoolClient,
  who: (typeof REVIEW)["client" | "family"],
  role: "customer" | "producer",
  passwordHash: string | null,
) {
  // رقم المراجعة قد يكون مسجلًا من حساب تجريبي سابق؛ يُعاد استخدامه بنفس المعرّف.
  const row = (
    await client.query(
      `INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at,username,password_hash,review_account)
       VALUES($1,$2,$3,$4,now(),$5,$6,true)
       ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,username=EXCLUDED.username,
         password_hash=COALESCE(EXCLUDED.password_hash,jdatna.users.password_hash),review_account=true,
         phone_verified_at=COALESCE(jdatna.users.phone_verified_at,now()),suspended_at=NULL,deleted_at=NULL
       RETURNING id,password_hash IS NOT NULL AS "hasPassword"`,
      [randomUUID(), who.phone, who.name, role, who.username, passwordHash],
    )
  ).rows[0] as { id: string; hasPassword: boolean };
  if (!row.hasPassword)
    throw new HttpError(400, "اكتب كلمة مرور لحسابي المراجعة في أول تجهيز");
  return row.id;
}

/** ينشئ الحسابين وبياناتهما التجريبية أو يحدّثها، ويفتح «وضع المراجعة» لعدد الأيام المختار. */
export async function setupReview(user: SessionUser, input: unknown) {
  owner(user);
  const value = setupSchema.parse(input);
  const { hashPassword } = await import("./credentials");
  const passwordHash = value.password
    ? await hashPassword(value.password)
    : null;
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "jdatna.store-review",
    ]);
    const clientId = await upsertUser(
      client,
      REVIEW.client,
      "customer",
      passwordHash,
    );
    const familyUser = await upsertUser(
      client,
      REVIEW.family,
      "producer",
      passwordHash,
    );
    const city = (
      await client.query(
        "SELECT id FROM jdatna.cities WHERE name LIKE '%الرياض%' ORDER BY id LIMIT 1",
      )
    ).rows[0]?.id as string | undefined;
    const cityId =
      city ??
      ((await client.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1"))
        .rows[0]?.id as string);
    const familyId = (
      await client.query(
        `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,description,city_id,phone,delivery,pickup,status,verified,review_only)
         VALUES($1,$2,$3,$4,$5,$6,$7,true,true,'approved',false,true)
         ON CONFLICT(user_id) DO UPDATE SET status='approved',review_only=true,slug=EXCLUDED.slug,updated_at=now()
         RETURNING id`,
        [
          randomUUID(),
          familyUser,
          REVIEW.familySlug,
          REVIEW.family.name,
          "أسرة تجريبية لمراجعة المتجر فقط، لا تظهر في قوائم الموقع ولا يطلب منها العملاء.",
          cityId,
          REVIEW.family.phone,
        ],
      )
    ).rows[0].id as string;
    // الطبق التجريبي: يُنشأ مرة واحدة ويبقى متاحًا للطلب.
    let productId = (
      await client.query(
        "SELECT id FROM jdatna.products WHERE producer_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
        [familyId],
      )
    ).rows[0]?.id as string | undefined;
    if (!productId) {
      productId = randomUUID();
      await client.query(
        `INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status)
         VALUES($1,$2,$3,$4,$5,$6,'available')`,
        [
          productId,
          familyId,
          "جريش بالدجاج (تجريبي)",
          "طبق تجريبي لمراجعة المتجر: جريش نجدي مطبوخ على الطريقة البيتية.",
          45,
          "صحن",
        ],
      );
    } else
      await client.query(
        "UPDATE jdatna.products SET visible=true,hidden_by=NULL,status='available' WHERE id=$1",
        [productId],
      );
    // طلب ومحادثة جاهزان ليراهما المراجع من الطرفين.
    const hasOrder = (
      await client.query(
        "SELECT 1 FROM jdatna.order_requests WHERE user_id=$1 AND producer_id=$2",
        [clientId, familyId],
      )
    ).rowCount;
    if (!hasOrder)
      await client.query(
        `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,notes,status)
         VALUES($1,$2,'store-review',$3,$4,$5,$6,$7,$8,2,'lunch',current_date+1,current_date+1,$9,'accepted')`,
        [
          randomUUID(),
          randomUUID(),
          clientId,
          familyId,
          productId,
          JSON.stringify({
            productName: "جريش بالدجاج (تجريبي)",
            unit: "صحن",
            price: 45,
            producerName: REVIEW.family.name,
            offer: null,
          }),
          REVIEW.client.name,
          REVIEW.client.phone,
          "طلب تجريبي لمراجعة المتجر.",
        ],
      );
    const conversation = (
      await client.query(
        `INSERT INTO jdatna.conversations(id,customer_id,producer_id) VALUES($1,$2,$3)
         ON CONFLICT(customer_id,producer_id) DO UPDATE SET blocked_by=NULL RETURNING id`,
        [randomUUID(), clientId, familyId],
      )
    ).rows[0].id as string;
    const hasMessages = (
      await client.query(
        "SELECT 1 FROM jdatna.messages WHERE conversation_id=$1",
        [conversation],
      )
    ).rowCount;
    if (!hasMessages)
      for (const [sender, body] of [
        [clientId, "السلام عليكم، هل الجريش متوفر غدًا للغداء؟"],
        [familyUser, "وعليكم السلام، نعم متوفر، وطلبك مقبول."],
      ])
        await client.query(
          "INSERT INTO jdatna.messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)",
          [randomUUID(), conversation, sender, body],
        );
    await client.query(
      `INSERT INTO jdatna.platform_settings(key,value) VALUES($1,$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
      [
        SETTING,
        JSON.stringify({
          until: new Date(
            Date.now() + value.days * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      ],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES($1,$2,'store-review.setup',$3)",
      [randomUUID(), user.id, JSON.stringify({ days: value.days })],
    );
  });
  return reviewStatus(user);
}
