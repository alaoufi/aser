import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
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
         r.conversation_id AS "conversationId",r.created_at AS "createdAt",u.name AS "customerName"
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
         (SELECT round(avg(g.stars)::numeric,1)::float8 FROM jdatna.ratings g WHERE g.kind='family' AND g.target_id=p.id) AS "ratingAverage",
         (SELECT count(*)::int FROM jdatna.ratings g WHERE g.kind='family' AND g.target_id=p.id) AS "ratingCount"
       FROM jdatna.producer_subscription_plans s
       JOIN jdatna.producer_profiles p ON p.id=s.producer_id
       JOIN jdatna.cities c ON c.id=p.city_id
       JOIN jdatna.regions r ON r.id=c.region_id
       WHERE ${where.join(" AND ")}
       ORDER BY "ratingCount" DESC,p.created_at DESC LIMIT 200`,
      args,
    )
  ).rows;
  return rows.map((r) => ({
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
