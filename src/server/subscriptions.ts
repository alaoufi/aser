import { ratingAverageSql, ratingCountSql } from "./rating-sql";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { can } from "../lib/permissions";
import { HttpError } from "./security";

/**
 * الاشتراكات: الأسرة المعتمدة تتيح أنواع الاشتراك (يومي، أسبوعي، شهري، مدة محددة) والوجبات والتوصيل،
 * والعميل يطلب اشتراكًا فيُرسل ملخصه في محادثة مع الأسرة ويُحوَّل إليها للاتفاق والنقاش.
 */
export const planLabels = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  period: "مدة محددة",
} as const;
export const mealLabels = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
} as const;
export type PlanId = keyof typeof planLabels;
export type MealId = keyof typeof mealLabels;
const planIds = Object.keys(planLabels) as PlanId[];
const meal = z.enum(["breakfast", "lunch", "dinner"]);

export type SubscriptionPlan = {
  enabled: boolean;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  period: boolean;
  meals: MealId[];
  delivery: boolean;
  notes: string;
};
const emptyPlan: SubscriptionPlan = {
  enabled: false,
  daily: false,
  weekly: false,
  monthly: false,
  period: false,
  meals: [],
  delivery: false,
  notes: "",
};

async function ownFamily(user: SessionUser) {
  const row = (
    await db().query(
      "SELECT id,status,delivery FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0] as { id: string; status: string; delivery: boolean } | undefined;
  if (!row) throw new HttpError(404, "أنشئ ملف الأسرة المنتجة أولًا");
  return row;
}

/** إعدادات اشتراكات الأسرة، وطلبات الاشتراك الواردة لها. */
export async function ownSubscriptions(user: SessionUser) {
  const family = await ownFamily(user);
  const plan = (
    await db().query(
      "SELECT enabled,daily,weekly,monthly,period,meals,delivery,notes FROM jdatna.producer_subscription_plans WHERE producer_id=$1",
      [family.id],
    )
  ).rows[0] as SubscriptionPlan | undefined;
  const requests = (
    await db().query(
      `SELECT r.id,r.plan,r.start_date::text AS "startDate",r.days,r.meals,r.delivery,r.location,r.notes,r.status,
         r.conversation_id AS "conversationId",r.created_at AS "createdAt",u.name AS "customerName",
         r.customer_agreed_at AS "customerAgreedAt",
         (SELECT k.id FROM jdatna.subscription_contracts k WHERE k.subscription_id=r.id) AS "contractId"
       FROM jdatna.subscription_requests r JOIN jdatna.users u ON u.id=r.user_id
       WHERE r.producer_id=$1 ORDER BY r.created_at DESC LIMIT 100`,
      [family.id],
    )
  ).rows;
  return {
    plan: plan ?? emptyPlan,
    approved: family.status === "approved",
    familyDelivers: family.delivery,
    requests,
    menu: await familyMenu(family.id),
    schedule: await familyDaySchedule(user),
  };
}

const planSchema = z
  .object({
    enabled: z.boolean(),
    daily: z.boolean(),
    weekly: z.boolean(),
    monthly: z.boolean(),
    period: z.boolean(),
    meals: z.array(meal).max(3),
    delivery: z.boolean(),
    notes: z.string().trim().max(500).default(""),
  })
  .strict();

export async function saveSubscriptionPlan(user: SessionUser, input: unknown) {
  const v = planSchema.parse(input);
  const meals = [...new Set(v.meals)];
  if (v.enabled && !planIds.some((p) => v[p]))
    throw new HttpError(400, "اختر نوع اشتراك واحدًا على الأقل");
  if (v.enabled && !meals.length)
    throw new HttpError(400, "اختر وجبة واحدة على الأقل");
  const family = await ownFamily(user);
  await db().query(
    `INSERT INTO jdatna.producer_subscription_plans(producer_id,enabled,daily,weekly,monthly,period,meals,delivery,notes,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT(producer_id) DO UPDATE SET enabled=EXCLUDED.enabled,daily=EXCLUDED.daily,weekly=EXCLUDED.weekly,
       monthly=EXCLUDED.monthly,period=EXCLUDED.period,meals=EXCLUDED.meals,delivery=EXCLUDED.delivery,
       notes=EXCLUDED.notes,updated_at=now()`,
    [
      family.id,
      v.enabled,
      v.daily,
      v.weekly,
      v.monthly,
      v.period,
      meals,
      v.delivery,
      v.notes,
    ],
  );
  return ownSubscriptions(user);
}

export type SubscriptionFamily = {
  id: string;
  slug: string;
  name: string;
  cityName: string;
  regionName: string;
  logoUrl: string | null;
  plans: PlanId[];
  meals: MealId[];
  delivery: boolean;
  notes: string;
  ratingAverage: number | null;
  ratingCount: number;
  /** أطباق الاشتراك لكل وجبة تقدّمها الأسرة. */
  menu: MenuItem[];
};

/** الأسر المعتمدة التي تتيح الاشتراكات، في منطقة العميل أو مدينته (التوصيل اليومي محلي). */
export async function subscriptionFamilies(filters: {
  region?: string;
  city?: string;
}): Promise<SubscriptionFamily[]> {
  const args: unknown[] = [];
  const where = [
    "s.enabled",
    "p.status='approved'",
    "NOT p.review_only",
    "(s.daily OR s.weekly OR s.monthly OR s.period)",
    "cardinality(s.meals)>0",
  ];
  if (filters.city) {
    args.push(filters.city);
    where.push(`p.city_id=$${args.length}`);
  } else if (filters.region) {
    args.push(filters.region);
    where.push(`c.region_id=$${args.length}`);
  }
  const rows = (
    await db().query(
      `SELECT p.id,p.slug,COALESCE(p.trade_name,p.name) AS name,c.name AS "cityName",r.name AS "regionName",
         p.logo_url AS "logoUrl",s.daily,s.weekly,s.monthly,s.period,s.meals,(s.delivery AND p.delivery) AS delivery,s.notes,
         ${ratingAverageSql("family", "p.id")} AS "ratingAverage",
         ${ratingCountSql("family", "p.id")} AS "ratingCount"
       FROM jdatna.producer_subscription_plans s
       JOIN jdatna.producer_profiles p ON p.id=s.producer_id
       JOIN jdatna.cities c ON c.id=p.city_id
       JOIN jdatna.regions r ON r.id=c.region_id
       WHERE ${where.join(" AND ")}
       ORDER BY "ratingCount" DESC,p.created_at DESC LIMIT 200`,
      args,
    )
  ).rows;
  const menus = await menuOf(rows.map((r) => r.id));
  return rows.map((r) => ({
    menu: (menus.get(r.id) ?? []).filter((m) => r.meals.includes(m.meal)),
    id: r.id,
    slug: r.slug,
    name: r.name,
    cityName: r.cityName,
    regionName: r.regionName,
    logoUrl: r.logoUrl,
    plans: planIds.filter((p) => r[p]),
    meals: r.meals,
    delivery: r.delivery,
    notes: r.notes,
    ratingAverage: r.ratingAverage,
    ratingCount: r.ratingCount,
  }));
}

const requestSchema = z
  .object({
    family: z.string().trim().min(1).max(200),
    plan: z.enum(["daily", "weekly", "monthly", "period"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر تاريخ البدء"),
    days: z.number().int().min(1).max(365).nullable().default(null),
    meals: z.array(meal).min(1, "اختر وجبة واحدة على الأقل").max(3),
    delivery: z.boolean().default(false),
    location: z.string().trim().max(1000).default(""),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict();

const riyadhToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );

/** ملخص الطلب كما يصل للأسرة في المحادثة. */
export function subscriptionSummary(v: {
  plan: PlanId;
  startDate: string;
  days: number | null;
  meals: MealId[];
  delivery: boolean;
  location: string;
  notes: string;
}) {
  return [
    "طلب اشتراك جديد:",
    `• النوع: ${planLabels[v.plan]}${v.plan === "period" ? ` (${v.days} يوم)` : ""}`,
    `• يبدأ من: ${v.startDate}`,
    `• الوجبات: ${v.meals.map((m) => mealLabels[m]).join("، ")}`,
    `• التوصيل: ${v.delivery ? "نعم" : "استلام من الأسرة"}`,
    ...(v.delivery && v.location ? [`• موقع التوصيل: ${v.location}`] : []),
    ...(v.notes ? [`• ملاحظات: ${v.notes}`] : []),
    "نتفق هنا على التفاصيل والسعر.",
  ].join("\n");
}

/**
 * طلب الاشتراك: يتحقق مما تتيحه الأسرة، ثم يحفظ الطلب ويرسل ملخصه في محادثة معها،
 * ويعيد رقم المحادثة ليُحوَّل العميل إليها.
 */
export async function requestSubscription(user: SessionUser, input: unknown) {
  const v = requestSchema.parse(input);
  const meals = [...new Set(v.meals)];
  const family = (
    await db().query(
      `SELECT p.id,p.slug,p.user_id,COALESCE(p.trade_name,p.name) AS name,s.daily,s.weekly,s.monthly,s.period,s.meals,
         (s.delivery AND p.delivery) AS delivery
       FROM jdatna.producer_profiles p JOIN jdatna.producer_subscription_plans s ON s.producer_id=p.id
       WHERE p.slug=$1 AND p.status='approved' AND s.enabled`,
      [v.family],
    )
  ).rows[0];
  if (!family) throw new HttpError(404, "هذه الأسرة لا تقبل الاشتراكات الآن");
  if (family.user_id === user.id)
    throw new HttpError(400, "لا يمكنك طلب اشتراك من أسرتك");
  if (!family[v.plan])
    throw new HttpError(
      400,
      `الاشتراك ${planLabels[v.plan]} غير متاح لدى هذه الأسرة`,
    );
  if (meals.some((m) => !family.meals.includes(m)))
    throw new HttpError(400, "اختر من الوجبات التي تقدّمها الأسرة");
  if (v.delivery && !family.delivery)
    throw new HttpError(400, "هذه الأسرة لا توصّل؛ اختر الاستلام");
  if (v.delivery && v.location.length < 5)
    throw new HttpError(400, "اكتب موقع التوصيل أو رابط الخريطة");
  if (v.plan === "period" ? !v.days : v.days)
    throw new HttpError(
      400,
      v.plan === "period"
        ? "اكتب عدد أيام الاشتراك"
        : "عدد الأيام للمدة المحددة فقط",
    );
  if (v.startDate < riyadhToday())
    throw new HttpError(400, "تاريخ البدء من اليوم فصاعدًا");
  const { startConversation, sendMessage } = await import("./chat");
  const conversation = await startConversation(user, { producer: family.slug });
  const id = randomUUID();
  await db().query(
    `INSERT INTO jdatna.subscription_requests(id,producer_id,user_id,plan,start_date,days,meals,delivery,location,notes,conversation_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      family.id,
      user.id,
      v.plan,
      v.startDate,
      v.plan === "period" ? v.days : null,
      meals,
      v.delivery,
      v.delivery ? v.location : null,
      v.notes,
      conversation.id,
    ],
  );
  // الملخص رسالة في المحادثة نفسها؛ تصل الأسرة كإشعار رسالة جديدة.
  await sendMessage(user, conversation.id, {
    body: subscriptionSummary({ ...v, meals, location: v.location }),
  });
  return { id, conversationId: conversation.id };
}

/* ───────── قائمة أطباق الاشتراك، والاتفاق، واختيار العميل لأطباقه ───────── */

export type MenuItem = { id: string; meal: MealId; name: string };

/** أطباق الاشتراك الفعّالة لأسرة (أو لعدة أسر)، مرتبة بالوجبة ثم الإضافة. */
async function menuOf(producerIds: string[]) {
  if (!producerIds.length) return new Map<string, MenuItem[]>();
  const rows = (
    await db().query(
      `SELECT id,producer_id AS "producerId",meal,name FROM jdatna.subscription_menu_items
       WHERE producer_id=ANY($1::uuid[]) AND active
       ORDER BY array_position(ARRAY['breakfast','lunch','dinner'],meal),created_at`,
      [producerIds],
    )
  ).rows as (MenuItem & { producerId: string })[];
  const map = new Map<string, MenuItem[]>();
  for (const { producerId, ...item } of rows)
    map.set(producerId, [...(map.get(producerId) ?? []), item]);
  return map;
}
export async function familyMenu(producerId: string) {
  return (await menuOf([producerId])).get(producerId) ?? [];
}

export async function addMenuItem(user: SessionUser, input: unknown) {
  const v = z
    .object({
      meal,
      name: z.string().trim().min(2, "اكتب اسم الطبق").max(120),
    })
    .strict()
    .parse(input);
  const family = await ownFamily(user);
  const count = (
    await db().query(
      "SELECT count(*)::int AS n FROM jdatna.subscription_menu_items WHERE producer_id=$1 AND active",
      [family.id],
    )
  ).rows[0].n as number;
  if (count >= 60) throw new HttpError(400, "القائمة ممتلئة (60 طبقًا)");
  await db().query(
    "INSERT INTO jdatna.subscription_menu_items(id,producer_id,meal,name) VALUES($1,$2,$3,$4)",
    [randomUUID(), family.id, v.meal, v.name],
  );
  return familyMenu(family.id);
}

/** حذف طبق من القائمة: يُخفى فقط، فيبقى في اختيارات المشتركين السابقة ويُعرض لهم حتى يغيّروه. */
export async function removeMenuItem(user: SessionUser, input: unknown) {
  const { id } = z.object({ id: z.uuid() }).strict().parse(input);
  const family = await ownFamily(user);
  const r = await db().query(
    "UPDATE jdatna.subscription_menu_items SET active=false WHERE id=$1 AND producer_id=$2",
    [id, family.id],
  );
  if (!r.rowCount) throw new HttpError(404, "الطبق غير موجود");
  return familyMenu(family.id);
}

/** آخر يوم في الاشتراك (null لليومي المفتوح). */
const endSql = `CASE r.plan WHEN 'weekly' THEN r.start_date+6 WHEN 'monthly' THEN r.start_date+29
  WHEN 'period' THEN r.start_date+r.days-1 END`;

/**
 * قرار الأسرة: «أوافق على الاتفاق» بعد أن يضغط العميل «تم الاتفاق مع الأسرة»، فيُحفظ عقد الاشتراك الثابت
 * (الشروط ونسخة المحادثة حتى الآن وبصمتها)؛ أو «اعتذار». تصل رسالة للعميل في المحادثة.
 */
export async function decideSubscription(user: SessionUser, input: unknown) {
  const v = z
    .object({ id: z.uuid(), status: z.enum(["agreed", "declined"]) })
    .strict()
    .parse(input);
  const family = await ownFamily(user);
  const result = await transaction(async (client) => {
    const row = (
      await client.query(
        `SELECT r.*,r.start_date::text AS start,(${endSql})::text AS "end",u.name AS customer_name,
           COALESCE(p.trade_name,p.name) AS family_name
         FROM jdatna.subscription_requests r JOIN jdatna.users u ON u.id=r.user_id
         JOIN jdatna.producer_profiles p ON p.id=r.producer_id
         WHERE r.id=$1 AND r.producer_id=$2 FOR UPDATE OF r`,
        [v.id, family.id],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "طلب الاشتراك غير موجود");
    if (row.status === "agreed")
      throw new HttpError(409, "تم الاتفاق على هذا الاشتراك وحُفظ عقده");
    if (row.status !== "new")
      throw new HttpError(409, "طلب الاشتراك ليس بانتظار القرار");
    if (v.status === "declined") {
      await client.query(
        "UPDATE jdatna.subscription_requests SET status='declined' WHERE id=$1",
        [row.id],
      );
      return { conversationId: row.conversation_id, contractId: null };
    }
    if (!row.customer_agreed_at)
      throw new HttpError(
        409,
        "بانتظار أن يضغط العميل «تم الاتفاق مع الأسرة» في «اشتراكاتي»",
      );
    const transcript = row.conversation_id
      ? (
          await client.query(
            `SELECT CASE WHEN m.sender_id=$2 THEN 'customer' ELSE 'family' END AS side,
               u.name AS sender,m.body,m.created_at AS at
             FROM jdatna.messages m JOIN jdatna.users u ON u.id=m.sender_id
             JOIN jdatna.conversations c ON c.id=m.conversation_id
             WHERE m.conversation_id=$1 AND m.created_at>=COALESCE(c.visible_from,'-infinity')
             ORDER BY m.created_at`,
            [row.conversation_id, row.user_id],
          )
        ).rows
      : [];
    const terms = {
      plan: row.plan,
      planLabel: planLabels[row.plan as PlanId],
      startDate: row.start,
      endDate: row.end,
      days: row.days,
      meals: row.meals,
      mealLabels: (row.meals as MealId[]).map((m) => mealLabels[m]),
      delivery: row.delivery,
      location: row.location,
      notes: row.notes,
    };
    const familyAgreedAt = new Date().toISOString();
    const customerAgreedAt = new Date(row.customer_agreed_at).toISOString();
    const id = randomUUID();
    // البصمة تثبت أن نص العقد لم يتغير منذ حفظه.
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          id,
          subscription: row.id,
          family: row.family_name,
          customer: row.customer_name,
          terms,
          transcript,
          customerAgreedAt,
          familyAgreedAt,
        }),
      )
      .digest("hex");
    await client.query(
      `INSERT INTO jdatna.subscription_contracts(id,subscription_id,producer_id,user_id,family_name,customer_name,terms,transcript,
         customer_agreed_at,family_agreed_at,content_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        row.id,
        family.id,
        row.user_id,
        row.family_name,
        row.customer_name,
        JSON.stringify(terms),
        JSON.stringify(transcript),
        customerAgreedAt,
        familyAgreedAt,
        contentHash,
      ],
    );
    await client.query(
      "UPDATE jdatna.subscription_requests SET status='agreed' WHERE id=$1",
      [row.id],
    );
    return { conversationId: row.conversation_id, contractId: id };
  });
  if (result.conversationId) {
    const { sendMessage, reopenConversation } = await import("./chat");
    // محادثة حذفها أحدهما: تُستأنف فارغة لتصل رسالة القرار.
    await reopenConversation(result.conversationId);
    await sendMessage(user, result.conversationId, {
      body: result.contractId
        ? "وافقت الأسرة على الاتفاق ✓ حُفظ عقد الاشتراك ويمكنكما الاطلاع عليه. اختر أطباقك لكل وجبة من «اشتراكاتي»، ويمكنك تغيير طبق أي يوم قبله بيوم."
        : "نعتذر عن هذا الاشتراك. يسعدنا تواصلك في المحادثة لأي طلب آخر.",
    }).catch(() => null);
  }
  return ownSubscriptions(user);
}

/** العميل يضغط «تم الاتفاق مع الأسرة» بعد النقاش، فتُطلب موافقة الأسرة. */
export async function customerAgree(user: SessionUser, input: unknown) {
  const { id } = z.object({ id: z.uuid() }).strict().parse(input);
  const row = (
    await db().query(
      `UPDATE jdatna.subscription_requests SET customer_agreed_at=COALESCE(customer_agreed_at,now())
       WHERE id=$1 AND user_id=$2 AND status='new' RETURNING conversation_id AS "conversationId"`,
      [id, user.id],
    )
  ).rows[0];
  if (!row)
    throw new HttpError(404, "طلب الاشتراك غير موجود أو ليس بانتظار الاتفاق");
  if (row.conversationId) {
    const { sendMessage, reopenConversation } = await import("./chat");
    await reopenConversation(row.conversationId);
    await sendMessage(user, row.conversationId, {
      body: "تم الاتفاق مع الأسرة ✓ أرجو موافقتكم من «الاشتراكات» في لوحة الأسرة، فيُحفظ عقد الاشتراك.",
    }).catch(() => null);
  }
  return mySubscriptions(user);
}

export type Contract = {
  id: string;
  number: number;
  subscriptionId: string;
  familyName: string;
  customerName: string;
  terms: Record<string, unknown>;
  transcript: { side: string; sender: string; body: string; at: string }[];
  customerAgreedAt: string;
  familyAgreedAt: string;
  contentHash: string;
  createdAt: string;
};
const contractSelect = `SELECT k.id,k.number::int AS number,k.subscription_id AS "subscriptionId",k.family_name AS "familyName",
  k.customer_name AS "customerName",k.terms,k.transcript,k.customer_agreed_at AS "customerAgreedAt",
  k.family_agreed_at AS "familyAgreedAt",k.content_hash AS "contentHash",k.created_at AS "createdAt"
  FROM jdatna.subscription_contracts k`;

/** العقد: يطّلع عليه العميل وصاحبة الأسرة، والإدارة (صلاحية الطلبات). */
export async function viewContract(user: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "العقد غير موجود");
  const row = (
    await db().query(
      `${contractSelect} JOIN jdatna.producer_profiles p ON p.id=k.producer_id
       WHERE k.id=$1 AND (k.user_id=$2 OR p.user_id=$2 OR $3)`,
      [id, user.id, can(user, "contracts")],
    )
  ).rows[0] as Contract | undefined;
  if (!row) throw new HttpError(404, "العقد غير موجود");
  return row;
}

/** الإدارة ← «عقود الاشتراكات». */
export async function adminContracts(user: SessionUser) {
  if (!can(user, "contracts"))
    throw new HttpError(403, "لا تملك صلاحية عقود الاشتراكات");
  return (
    await db().query(
      `SELECT k.id,k.number::int AS number,k.family_name AS "familyName",k.customer_name AS "customerName",
         k.terms->>'planLabel' AS plan,k.terms->>'startDate' AS "startDate",k.family_agreed_at AS "familyAgreedAt"
       FROM jdatna.subscription_contracts k ORDER BY k.created_at DESC LIMIT 300`,
    )
  ).rows;
}

const tomorrow = () => {
  const d = new Date(`${riyadhToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** اشتراك العميل مع التأكد من ملكيته؛ اختيار الأطباق بعد الاتفاق فقط. */
async function ownAgreed(user: SessionUser, id: string) {
  const row = (
    await db().query(
      `SELECT r.id,r.producer_id,r.meals,r.status,r.start_date::text AS start,(${endSql})::text AS "end"
       FROM jdatna.subscription_requests r WHERE r.id=$1 AND r.user_id=$2`,
      [id, user.id],
    )
  ).rows[0] as
    | {
        id: string;
        producer_id: string;
        meals: MealId[];
        status: string;
        start: string;
        end: string | null;
      }
    | undefined;
  if (!row) throw new HttpError(404, "الاشتراك غير موجود");
  if (row.status !== "agreed")
    throw new HttpError(
      409,
      "تختار أطباقك بعد أن تؤكد الأسرة الاتفاق على الاشتراك",
    );
  return row;
}

async function assertItem(producerId: string, meal: MealId, itemId: string) {
  const ok = (
    await db().query(
      "SELECT 1 FROM jdatna.subscription_menu_items WHERE id=$1 AND producer_id=$2 AND meal=$3 AND active",
      [itemId, producerId, meal],
    )
  ).rowCount;
  if (!ok) throw new HttpError(400, "اختر طبقًا من قائمة الأسرة لهذه الوجبة");
}

/** الطبق الدائم لوجبة في الاشتراك. */
export async function setDefaultDish(user: SessionUser, input: unknown) {
  const v = z
    .object({ id: z.uuid(), meal, itemId: z.uuid() })
    .strict()
    .parse(input);
  const sub = await ownAgreed(user, v.id);
  if (!sub.meals.includes(v.meal))
    throw new HttpError(400, "هذه الوجبة ليست في اشتراكك");
  await assertItem(sub.producer_id, v.meal, v.itemId);
  await db().query(
    `INSERT INTO jdatna.subscription_choices(subscription_id,meal,item_id) VALUES($1,$2,$3)
     ON CONFLICT(subscription_id,meal) DO UPDATE SET item_id=EXCLUDED.item_id,updated_at=now()`,
    [v.id, v.meal, v.itemId],
  );
  return mySubscriptions(user);
}

/**
 * طبق مختلف ليوم واحد: من الغد فصاعدًا فقط (قبل اليوم بيوم)، وضمن مدة الاشتراك.
 * itemId=null يعيد اليوم إلى الطبق الدائم.
 */
export async function setDayDish(user: SessionUser, input: unknown) {
  const v = z
    .object({
      id: z.uuid(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      meal,
      itemId: z.uuid().nullable(),
    })
    .strict()
    .parse(input);
  const sub = await ownAgreed(user, v.id);
  if (!sub.meals.includes(v.meal))
    throw new HttpError(400, "هذه الوجبة ليست في اشتراكك");
  if (v.day < tomorrow())
    throw new HttpError(409, "يُعدَّل طلب اليوم قبله بيوم على الأقل");
  if (v.day < sub.start || (sub.end && v.day > sub.end))
    throw new HttpError(400, "هذا اليوم خارج مدة اشتراكك");
  if (v.itemId === null) {
    await db().query(
      "DELETE FROM jdatna.subscription_day_choices WHERE subscription_id=$1 AND day=$2 AND meal=$3",
      [v.id, v.day, v.meal],
    );
  } else {
    await assertItem(sub.producer_id, v.meal, v.itemId);
    await db().query(
      `INSERT INTO jdatna.subscription_day_choices(subscription_id,day,meal,item_id) VALUES($1,$2,$3,$4)
       ON CONFLICT(subscription_id,day,meal) DO UPDATE SET item_id=EXCLUDED.item_id,updated_at=now()`,
      [v.id, v.day, v.meal, v.itemId],
    );
  }
  return mySubscriptions(user);
}

/** الأيام القادمة المعروضة للتعديل: من الغد، أسبوعان داخل مدة الاشتراك. */
function upcomingDays(start: string, end: string | null) {
  const days: string[] = [];
  let day = start > tomorrow() ? start : tomorrow();
  while (days.length < 14 && (!end || day <= end)) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/** «اشتراكاتي»: اشتراكات العميل، وقائمة كل أسرة، وأطباقه الدائمة وتغييرات الأيام القادمة. */
export async function mySubscriptions(user: SessionUser) {
  const subs = (
    await db().query(
      `SELECT r.id,r.producer_id AS "producerId",COALESCE(p.trade_name,p.name) AS "familyName",p.slug,
         r.plan,r.start_date::text AS "startDate",(${endSql})::text AS "endDate",r.days,r.meals,r.delivery,r.status,
         r.conversation_id AS "conversationId",r.customer_agreed_at AS "customerAgreedAt",
         (SELECT k.id FROM jdatna.subscription_contracts k WHERE k.subscription_id=r.id) AS "contractId",
         COALESCE((SELECT json_object_agg(c.meal,c.item_id) FROM jdatna.subscription_choices c WHERE c.subscription_id=r.id),'{}') AS defaults,
         COALESCE((SELECT json_agg(json_build_object('day',d.day::text,'meal',d.meal,'itemId',d.item_id))
           FROM jdatna.subscription_day_choices d WHERE d.subscription_id=r.id AND d.day>=$2::date),'[]') AS overrides
       FROM jdatna.subscription_requests r JOIN jdatna.producer_profiles p ON p.id=r.producer_id
       WHERE r.user_id=$1 ORDER BY (r.status='agreed') DESC,r.created_at DESC LIMIT 50`,
      [user.id, riyadhToday()],
    )
  ).rows;
  const menus = await menuOf([...new Set(subs.map((s) => s.producerId))]);
  // الأطباق المخفية التي ما زالت مختارة تُعرض باسمها حتى يغيّرها العميل.
  const chosen = [
    ...new Set(
      subs.flatMap((s) => [
        ...Object.values(s.defaults as Record<string, string>),
        ...(s.overrides as { itemId: string }[]).map((o) => o.itemId),
      ]),
    ),
  ];
  const names = new Map<string, string>(
    chosen.length
      ? (
          await db().query(
            "SELECT id,name FROM jdatna.subscription_menu_items WHERE id=ANY($1::uuid[])",
            [chosen],
          )
        ).rows.map((r) => [r.id, r.name])
      : [],
  );
  return {
    today: riyadhToday(),
    firstEditable: tomorrow(),
    subscriptions: subs.map((s) => ({
      ...s,
      menu: (menus.get(s.producerId) ?? []).filter((m) =>
        (s.meals as MealId[]).includes(m.meal),
      ),
      itemNames: Object.fromEntries(names),
      upcoming:
        s.status === "agreed" ? upcomingDays(s.startDate, s.endDate) : [],
    })),
  };
}

/** جدول يوم للأسرة (الغد افتراضيًا): لكل مشترك متفق معه وجباته والطبق المختار لكل وجبة. */
export async function familyDaySchedule(user: SessionUser, day = tomorrow()) {
  const family = await ownFamily(user);
  return {
    day,
    rows: (
      await db().query(
        `SELECT r.id,u.name AS "customerName",r.delivery,r.location,m.meal,
           COALESCE(di.name,ci.name) AS dish
         FROM jdatna.subscription_requests r
         JOIN jdatna.users u ON u.id=r.user_id
         CROSS JOIN LATERAL unnest(r.meals) AS m(meal)
         LEFT JOIN jdatna.subscription_day_choices d ON d.subscription_id=r.id AND d.day=$2::date AND d.meal=m.meal
         LEFT JOIN jdatna.subscription_menu_items di ON di.id=d.item_id
         LEFT JOIN jdatna.subscription_choices c ON c.subscription_id=r.id AND c.meal=m.meal
         LEFT JOIN jdatna.subscription_menu_items ci ON ci.id=c.item_id
         WHERE r.producer_id=$1 AND r.status='agreed' AND r.start_date<=$2::date
           AND (${endSql} IS NULL OR ${endSql}>=$2::date)
         ORDER BY u.name,array_position(ARRAY['breakfast','lunch','dinner'],m.meal)`,
        [family.id, day],
      )
    ).rows as {
      id: string;
      customerName: string;
      delivery: boolean;
      location: string | null;
      meal: MealId;
      dish: string | null;
    }[],
  };
}
