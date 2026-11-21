import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { can } from "../lib/permissions";
import {
  AD_FRAME,
  MAX_AD_IMAGE_BYTES,
  MAX_AD_VIDEO_BYTES,
  PLACEMENT_IDS,
  deliver,
  inSchedule,
  matchesContext,
  type AdContext,
  type AdSchedule,
  type Placement,
} from "../lib/ads";
import { databaseConfigured, db, transaction } from "./db";
import { HttpError } from "./security";

/**
 * الإعلانات الترويجية (من «أي خدمة»، code/promo-ads في المكتبة المشتركة): إعلانات الإدارة الآن، بلا دفع.
 * - العرض للزائر: الحالة والتاريخ وحد المشاهدات الكلي واليومي والتوزيع المتساوي وحدود الحملة في SQL،
 *   ثم الجدولة والاستهداف والترتيب (lib/ads.ts).
 * - الإدارة: صلاحية «ads» (والمدير الكامل)، وكل تعديل يُسجَّل في سجل النشاطات.
 */
const manage = (user: SessionUser) => {
  if (!can(user, "ads"))
    throw new HttpError(403, "لا تملك صلاحية الإعلانات الترويجية");
};
const audit = (
  client: { query: (sql: string, args: unknown[]) => Promise<unknown> },
  user: SessionUser,
  action: string,
  target: string | null,
  details: unknown,
) =>
  client.query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), user.id, action, target, JSON.stringify(details)],
  );

/** شروط «يعمل الآن» في SQL (a = الإعلان، td = إحصاء اليوم، c = الحملة). */
const LIVE = `
  a.status = 'active'
  AND (a.starts_at IS NULL OR a.starts_at <= now())
  AND (a.ends_at IS NULL OR a.ends_at > now())
  AND (a.max_views IS NULL OR a.views_count < a.max_views)
  AND (a.daily_max_views IS NULL OR COALESCE(td.views, 0) < a.daily_max_views)
  AND (a.pacing <> 'even' OR a.max_views IS NULL OR a.ends_at IS NULL
       OR COALESCE(td.views, 0) < CEIL((a.max_views - a.views_count + COALESCE(td.views, 0))::numeric
          / GREATEST(1, CEIL(EXTRACT(EPOCH FROM (a.ends_at - date_trunc('day', now()))) / 86400.0))))
  AND (a.campaign_id IS NULL OR (c.status = 'active'
       AND (c.starts_at IS NULL OR c.starts_at <= now()) AND (c.ends_at IS NULL OR c.ends_at > now())
       AND (c.max_views IS NULL OR (SELECT COALESCE(SUM(x.views_count), 0) FROM jdatna.ads x WHERE x.campaign_id = c.id) < c.max_views)
       AND (c.daily_max_views IS NULL OR (SELECT COALESCE(SUM(s.views), 0) FROM jdatna.ad_stats_daily s
            JOIN jdatna.ads x ON x.id = s.ad_id WHERE x.campaign_id = c.id AND s.day = (now() AT TIME ZONE 'Asia/Riyadh')::date) < c.daily_max_views)))`;
const TODAY = `(now() AT TIME ZONE 'Asia/Riyadh')::date`;

type LiveRow = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  media_id: string | null;
  media_type: "image" | "video";
  promo: boolean;
  freq_cap_per_day: number | null;
  priority: number;
  weight: number;
  schedule: AdSchedule | null;
  target_devices: string[];
  target_audience: string[];
  target_regions: string[];
  exclusive: boolean;
};
export type PublicAd = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  media: string | null;
  mediaType: "image" | "video";
  promo: boolean;
  freqCap: number | null;
};

export async function liveAds(
  placement: Placement,
  ctx: AdContext,
  limit = 3,
): Promise<PublicAd[]> {
  if (!databaseConfigured()) return [];
  const rows = (
    await db().query<LiveRow>(
      `SELECT a.id,a.title,a.description,a.link,a.media_id,a.media_type,(a.user_id IS NULL) AS promo,
         a.freq_cap_per_day,a.priority,a.weight,a.schedule,a.target_devices,a.target_audience,a.target_regions,a.exclusive
       FROM jdatna.ads a
       LEFT JOIN jdatna.ad_stats_daily td ON td.ad_id = a.id AND td.day = ${TODAY}
       LEFT JOIN jdatna.ad_campaigns c ON c.id = a.campaign_id
       WHERE $1 = ANY(a.placements) AND ${LIVE}
       ORDER BY a.sort_order`,
      [placement],
    )
  ).rows;
  return deliver(rows, ctx)
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      link: a.link,
      media: a.media_id ? `/api/ads/media/${a.media_id}` : null,
      mediaType: a.media_type,
      promo: a.promo,
      freqCap: a.freq_cap_per_day,
    }));
}

/** مشاهدة أو نقرة: تُحسب للإعلان العامل فقط، ويومها بتوقيت الرياض. */
export async function trackAd(id: string, kind: "view" | "click") {
  if (!z.uuid().safeParse(id).success) return;
  await transaction(async (client) => {
    // جملتان ثابتتان، لا نص يُبنى من الطلب.
    const r = await client.query(
      kind === "view"
        ? "UPDATE jdatna.ads SET views_count=views_count+1 WHERE id=$1 AND status='active' RETURNING id"
        : "UPDATE jdatna.ads SET clicks_count=clicks_count+1 WHERE id=$1 AND status='active' RETURNING id",
      [id],
    );
    if (!r.rowCount) return;
    await client.query(
      `INSERT INTO jdatna.ad_stats_daily(ad_id,day,views,clicks) VALUES($1,${TODAY},$2,$3)
       ON CONFLICT(ad_id,day) DO UPDATE SET views=ad_stats_daily.views+EXCLUDED.views,clicks=ad_stats_daily.clicks+EXCLUDED.clicks`,
      [id, kind === "view" ? 1 : 0, kind === "click" ? 1 : 0],
    );
  });
}

export async function adMedia(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "غير موجود");
  const row = (
    await db().query<{ mime: string; data: Buffer }>(
      "SELECT mime,data FROM jdatna.ad_media WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "غير موجود");
  return row;
}

// ———————————————————— الإدارة ————————————————————

/** صورة أو مقطع الإعلان: الصورة تُعاد للإطار 1200×400 (قص بلا تمطيط) وتُحفظ WebP بلا بيانات وصفية. */
export async function uploadAdMedia(user: SessionUser, file: File) {
  manage(user);
  const mime = file.type;
  const video = mime === "video/mp4" || mime === "video/webm";
  const image = ["image/jpeg", "image/png", "image/webp"].includes(mime);
  if (!video && !image)
    throw new HttpError(
      400,
      "الملف يجب أن يكون صورة (JPG أو PNG أو WebP) أو مقطعًا (MP4 أو WebM)",
    );
  if (file.size > (video ? MAX_AD_VIDEO_BYTES : MAX_AD_IMAGE_BYTES))
    throw new HttpError(
      413,
      video ? "المقطع أكبر من 15 م.ب" : "الصورة أكبر من 3 م.ب",
    );
  const input = Buffer.from(await file.arrayBuffer());
  let data = input;
  let width: number | null = null;
  let height: number | null = null;
  let stored = mime;
  if (image) {
    try {
      data = await sharp(input, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(AD_FRAME.width, AD_FRAME.height, { fit: "cover" })
        .webp({ quality: 84 })
        .toBuffer();
    } catch {
      throw new HttpError(400, "تعذّر قراءة الصورة");
    }
    width = AD_FRAME.width;
    height = AD_FRAME.height;
    stored = "image/webp";
  }
  const id = randomUUID();
  await db().query(
    "INSERT INTO jdatna.ad_media(id,mime,size,width,height,data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, stored, data.length, width, height, data, user.id],
  );
  return {
    id,
    url: `/api/ads/media/${id}`,
    mediaType: video ? "video" : "image",
  };
}

const nullableInt = z
  .union([z.number().int().positive(), z.null()])
  .optional()
  .transform((v) => v ?? null);
const when = z
  .union([z.iso.datetime({ offset: true }), z.null()])
  .optional()
  .transform((v) => v ?? null);
const adInput = z
  .object({
    id: z.uuid().optional(),
    title: z.string().trim().min(1, "اكتب عنوان الإعلان").max(200),
    description: z.string().trim().max(1000).optional().default(""),
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^(https:\/\/|\/)/.test(v), {
        message: "الرابط يبدأ بـ https:// أو / (صفحة في الموقع)",
      })
      .optional()
      .default(""),
    mediaId: z.union([z.uuid(), z.null()]).optional().default(null),
    mediaType: z.enum(["image", "video"]).default("image"),
    placements: z
      .array(z.enum(PLACEMENT_IDS as [Placement, ...Placement[]]))
      .min(1, "اختر مكانًا واحدًا على الأقل")
      .max(20),
    startsAt: when,
    endsAt: when,
    maxViews: nullableInt,
    dailyMaxViews: nullableInt,
    freqCapPerDay: nullableInt,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    weight: z.number().int().min(1).max(10).default(1),
    pacing: z.enum(["asap", "even"]).default("asap"),
    schedule: z
      .union([
        z
          .object({
            days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
            from: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .or(z.literal(""))
              .default(""),
            to: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .or(z.literal(""))
              .default(""),
          })
          .strict(),
        z.null(),
      ])
      .optional()
      .default(null),
    targetRegions: z.array(z.string().max(40)).max(30).default([]),
    targetDevices: z
      .array(z.enum(["mobile", "desktop"]))
      .max(2)
      .default([]),
    targetAudience: z
      .array(z.enum(["guest", "customer", "producer"]))
      .max(3)
      .default([]),
    campaignId: z.union([z.uuid(), z.null()]).optional().default(null),
    exclusive: z.boolean().default(false),
    status: z.enum(["active", "paused"]).default("active"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.startsAt &&
      v.endsAt &&
      Date.parse(v.endsAt) <= Date.parse(v.startsAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "تاريخ النهاية بعد البداية",
        path: ["endsAt"],
      });
    if (v.pacing === "even" && (!v.endsAt || !v.maxViews))
      ctx.addIssue({
        code: "custom",
        message: "التوزيع المتساوي يحتاج تاريخ نهاية وحد مشاهدات",
        path: ["pacing"],
      });
  });

export type AdminAd = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  mediaId: string | null;
  mediaType: "image" | "video";
  placements: Placement[];
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  maxViews: number | null;
  dailyMaxViews: number | null;
  freqCapPerDay: number | null;
  priority: number;
  weight: number;
  pacing: "asap" | "even";
  schedule: AdSchedule | null;
  targetRegions: string[];
  targetDevices: string[];
  targetAudience: string[];
  campaignId: string | null;
  campaignName: string | null;
  exclusive: boolean;
  viewsCount: number;
  clicksCount: number;
  todayViews: number;
  createdAt: string;
};
const ADMIN_SELECT = `SELECT a.id,a.title,a.description,a.link,a.media_id AS "mediaId",a.media_type AS "mediaType",
  a.placements,a.status,a.starts_at AS "startsAt",a.ends_at AS "endsAt",a.max_views AS "maxViews",
  a.daily_max_views AS "dailyMaxViews",a.freq_cap_per_day AS "freqCapPerDay",a.priority,a.weight,a.pacing,a.schedule,
  a.target_regions AS "targetRegions",a.target_devices AS "targetDevices",a.target_audience AS "targetAudience",
  a.campaign_id AS "campaignId",c.name AS "campaignName",a.exclusive,a.views_count AS "viewsCount",
  a.clicks_count AS "clicksCount",COALESCE(td.views,0) AS "todayViews",a.created_at AS "createdAt"
  FROM jdatna.ads a
  LEFT JOIN jdatna.ad_campaigns c ON c.id=a.campaign_id
  LEFT JOIN jdatna.ad_stats_daily td ON td.ad_id=a.id AND td.day=${TODAY}`;

export async function adminAds(user: SessionUser) {
  manage(user);
  const [ads, campaigns, regions] = await Promise.all([
    db().query<AdminAd>(
      `${ADMIN_SELECT} WHERE a.status <> 'cancelled' OR a.updated_at > now() - interval '30 days'
       ORDER BY (a.status='active') DESC, a.created_at DESC LIMIT 300`,
    ),
    adminCampaignRows(),
    db().query<{ id: string; name: string }>(
      "SELECT id,name FROM jdatna.regions ORDER BY name",
    ),
  ]);
  return { ads: ads.rows, campaigns, regions: regions.rows };
}

export async function saveAd(user: SessionUser, input: unknown) {
  manage(user);
  const v = adInput.parse(input);
  const id = v.id ?? randomUUID();
  const schedule =
    v.schedule && (v.schedule.days.length || (v.schedule.from && v.schedule.to))
      ? v.schedule
      : null;
  const values = [
    id,
    v.title,
    v.description || null,
    v.link || null,
    v.mediaId,
    v.mediaType,
    v.placements,
    v.startsAt,
    v.endsAt,
    v.maxViews,
    v.dailyMaxViews,
    v.freqCapPerDay,
    v.priority,
    v.weight,
    v.pacing,
    schedule ? JSON.stringify(schedule) : null,
    v.targetRegions,
    v.targetDevices,
    v.targetAudience,
    v.campaignId,
    v.exclusive,
    v.status,
    user.id,
  ];
  await transaction(async (client) => {
    if (v.id) {
      const r = await client.query(
        `UPDATE jdatna.ads SET title=$2,description=$3,link=$4,media_id=$5,media_type=$6,placements=$7,starts_at=$8,
           ends_at=$9,max_views=$10,daily_max_views=$11,freq_cap_per_day=$12,priority=$13,weight=$14,pacing=$15,
           schedule=$16,target_regions=$17,target_devices=$18,target_audience=$19,campaign_id=$20,exclusive=$21,
           status=CASE WHEN status='cancelled' THEN status ELSE $22 END,updated_at=now()
         WHERE id=$1 AND $23::uuid IS NOT NULL`,
        values,
      );
      if (!r.rowCount) throw new HttpError(404, "الإعلان غير موجود");
    } else
      await client.query(
        `INSERT INTO jdatna.ads(id,title,description,link,media_id,media_type,placements,starts_at,ends_at,max_views,
           daily_max_views,freq_cap_per_day,priority,weight,pacing,schedule,target_regions,target_devices,
           target_audience,campaign_id,exclusive,status,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        values,
      );
    await audit(client, user, v.id ? "ad.update" : "ad.create", id, {
      title: v.title,
      placements: v.placements,
    });
  });
  return adminAds(user);
}

/** تنشيط أو إيقاف أو إلغاء (الإلغاء نهائي)، أو حذف نهائي مع صورته. */
export async function changeAd(user: SessionUser, input: unknown) {
  manage(user);
  const { id, action } = z
    .object({
      id: z.uuid(),
      action: z.enum(["activate", "pause", "cancel", "delete"]),
    })
    .strict()
    .parse(input);
  await transaction(async (client) => {
    if (action === "delete") {
      const r = await client.query<{ media_id: string | null }>(
        "DELETE FROM jdatna.ads WHERE id=$1 RETURNING media_id",
        [id],
      );
      if (!r.rowCount) throw new HttpError(404, "الإعلان غير موجود");
      const media = r.rows[0].media_id;
      if (media)
        await client.query(
          "DELETE FROM jdatna.ad_media m WHERE m.id=$1 AND NOT EXISTS (SELECT 1 FROM jdatna.ads WHERE media_id=m.id)",
          [media],
        );
    } else {
      const status = {
        activate: "active",
        pause: "paused",
        cancel: "cancelled",
      }[action];
      const r = await client.query(
        "UPDATE jdatna.ads SET status=$2,updated_at=now() WHERE id=$1 AND status<>'cancelled'",
        [id, status],
      );
      if (!r.rowCount) throw new HttpError(409, "الإعلان ملغى أو غير موجود");
    }
    await audit(client, user, "ad." + action, id, {});
  });
  return adminAds(user);
}

/**
 * «لماذا يظهر الإعلان أو لا يظهر» (AYK-405): كل شرط بكلام عادي، وتحت كل شرط لم يتحقق ما يصلحه.
 * context: الجهاز والجمهور والمنطقة التي يُفحص لها (افتراضيًا أي زائر).
 */
export async function whyAd(
  user: SessionUser,
  id: string,
  ctx: Partial<AdContext> = {},
) {
  manage(user);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "الإعلان غير موجود");
  const ad = (
    await db().query<
      AdminAd & {
        campaignStatus: string | null;
        campaignStarts: string | null;
        campaignEnds: string | null;
        live: boolean;
        hasMedia: boolean;
      }
    >(
      `SELECT x.*, c.status AS "campaignStatus", c.starts_at AS "campaignStarts", c.ends_at AS "campaignEnds",
         EXISTS (SELECT 1 FROM jdatna.ads a LEFT JOIN jdatna.ad_stats_daily td ON td.ad_id=a.id AND td.day=${TODAY}
                 LEFT JOIN jdatna.ad_campaigns c ON c.id=a.campaign_id WHERE a.id=x.id AND ${LIVE}) AS live,
         (x."mediaId" IS NOT NULL) AS "hasMedia"
       FROM (${ADMIN_SELECT} WHERE a.id=$1) x LEFT JOIN jdatna.ad_campaigns c ON c.id=x."campaignId"`,
      [id],
    )
  ).rows[0];
  if (!ad) throw new HttpError(404, "الإعلان غير موجود");
  const now = Date.now();
  const checks: { ok: boolean; text: string; fix?: string }[] = [
    {
      ok: ad.status === "active",
      text:
        ad.status === "active"
          ? "الإعلان مفعّل"
          : ad.status === "paused"
            ? "الإعلان موقوف"
            : "الإعلان ملغى",
      fix: ad.status === "paused" ? "activate" : undefined,
    },
    {
      ok: !ad.startsAt || Date.parse(ad.startsAt) <= now,
      text: ad.startsAt ? "تاريخ البداية" : "بلا تاريخ بداية (يبدأ فورًا)",
      fix: "startsAt",
    },
    {
      ok: !ad.endsAt || Date.parse(ad.endsAt) > now,
      text: ad.endsAt ? "تاريخ النهاية" : "بلا تاريخ نهاية",
      fix: "endsAt",
    },
    {
      ok: !ad.maxViews || ad.viewsCount < ad.maxViews,
      text: ad.maxViews
        ? `المشاهدات ${ad.viewsCount} من ${ad.maxViews}`
        : "بلا حد للمشاهدات",
      fix: "maxViews",
    },
    {
      ok: !ad.dailyMaxViews || ad.todayViews < ad.dailyMaxViews,
      text: ad.dailyMaxViews
        ? `مشاهدات اليوم ${ad.todayViews} من ${ad.dailyMaxViews}`
        : "بلا حد يومي",
      fix: "dailyMaxViews",
    },
    {
      ok: inSchedule(ad.schedule),
      text: ad.schedule
        ? "الجدولة الأسبوعية (بتوقيت السعودية)"
        : "بلا جدولة (كل الأوقات)",
      fix: "schedule",
    },
    {
      ok:
        !ad.campaignId ||
        (ad.campaignStatus === "active" &&
          (!ad.campaignStarts || Date.parse(ad.campaignStarts) <= now) &&
          (!ad.campaignEnds || Date.parse(ad.campaignEnds) > now)),
      text: ad.campaignId ? `الحملة «${ad.campaignName}»` : "بلا حملة",
      fix: "campaignId",
    },
    {
      ok: ad.hasMedia || Boolean(ad.title),
      text: ad.hasMedia ? "له صورة أو مقطع" : "بلا صورة (يظهر نصًا فقط)",
    },
  ];
  if (ctx.device || ctx.audience || ctx.region !== undefined) {
    const full: AdContext = {
      device: ctx.device ?? "mobile",
      audience: ctx.audience ?? "guest",
      region: ctx.region ?? null,
    };
    checks.push({
      ok: matchesContext(
        {
          priority: ad.priority,
          weight: ad.weight,
          schedule: ad.schedule,
          target_devices: ad.targetDevices,
          target_audience: ad.targetAudience,
          target_regions: ad.targetRegions,
          exclusive: ad.exclusive,
        },
        full,
      ),
      text: "الاستهداف (الجهاز والجمهور والمنطقة) لهذا الزائر",
      fix: "targeting",
    });
  }
  // الشروط في SQL هي الحَكَم (تشمل التوزيع المتساوي وحدود الحملة).
  return { live: ad.live, checks };
}

// ———— الحملات والتقارير (AYK-409) ————

async function adminCampaignRows() {
  return (
    await db().query(
      `SELECT c.id,c.name,c.advertiser,c.notes,c.status,c.starts_at AS "startsAt",c.ends_at AS "endsAt",
         c.max_views AS "maxViews",c.daily_max_views AS "dailyMaxViews",
         (SELECT count(*)::int FROM jdatna.ads a WHERE a.campaign_id=c.id) AS "adsCount",
         (SELECT COALESCE(SUM(a.views_count),0)::int FROM jdatna.ads a WHERE a.campaign_id=c.id) AS "viewsCount"
       FROM jdatna.ad_campaigns c ORDER BY c.created_at DESC LIMIT 200`,
    )
  ).rows;
}
const campaignInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "اكتب اسم الحملة").max(150),
    advertiser: z.string().trim().max(150).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
    status: z.enum(["active", "paused"]).default("active"),
    startsAt: when,
    endsAt: when,
    maxViews: nullableInt,
    dailyMaxViews: nullableInt,
  })
  .strict();
export async function saveCampaign(user: SessionUser, input: unknown) {
  manage(user);
  const v = campaignInput.parse(input);
  const id = v.id ?? randomUUID();
  await transaction(async (client) => {
    const values = [
      id,
      v.name,
      v.advertiser || null,
      v.notes || null,
      v.status,
      v.startsAt,
      v.endsAt,
      v.maxViews,
      v.dailyMaxViews,
      user.id,
    ];
    if (v.id) {
      const r = await client.query(
        `UPDATE jdatna.ad_campaigns SET name=$2,advertiser=$3,notes=$4,status=$5,starts_at=$6,ends_at=$7,max_views=$8,
           daily_max_views=$9,updated_at=now() WHERE id=$1 AND $10::uuid IS NOT NULL`,
        values,
      );
      if (!r.rowCount) throw new HttpError(404, "الحملة غير موجودة");
    } else
      await client.query(
        `INSERT INTO jdatna.ad_campaigns(id,name,advertiser,notes,status,starts_at,ends_at,max_views,daily_max_views,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        values,
      );
    await audit(
      client,
      user,
      v.id ? "ad-campaign.update" : "ad-campaign.create",
      id,
      {
        name: v.name,
      },
    );
  });
  return adminAds(user);
}
/** حذف الحملة لا يحذف إعلاناتها: تبقى بلا حملة. */
export async function deleteCampaign(user: SessionUser, id: string) {
  manage(user);
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(404, "الحملة غير موجودة");
  await transaction(async (client) => {
    const r = await client.query(
      "DELETE FROM jdatna.ad_campaigns WHERE id=$1",
      [id],
    );
    if (!r.rowCount) throw new HttpError(404, "الحملة غير موجودة");
    await audit(client, user, "ad-campaign.delete", id, {});
  });
  return adminAds(user);
}

/** التقرير: المشاهدات والنقرات ونسبة النقر لكل إعلان في المدة، والأفضل أداءً أولًا. */
export async function adsReport(user: SessionUser, input: unknown) {
  manage(user);
  const v = z
    .object({
      from: z.iso.date(),
      to: z.iso.date(),
      campaignId: z
        .union([z.uuid(), z.literal("")])
        .optional()
        .default(""),
    })
    .strict()
    .parse(input);
  if (v.to < v.from) throw new HttpError(400, "نهاية المدة قبل بدايتها");
  const rows = (
    await db().query<{
      id: string;
      title: string;
      campaignName: string | null;
      views: number;
      clicks: number;
    }>(
      `SELECT a.id,a.title,c.name AS "campaignName",COALESCE(SUM(s.views),0)::int AS views,
         COALESCE(SUM(s.clicks),0)::int AS clicks
       FROM jdatna.ads a
       LEFT JOIN jdatna.ad_campaigns c ON c.id=a.campaign_id
       LEFT JOIN jdatna.ad_stats_daily s ON s.ad_id=a.id AND s.day BETWEEN $1 AND $2
       WHERE ($3='' OR a.campaign_id::text=$3)
       GROUP BY a.id,a.title,c.name
       HAVING COALESCE(SUM(s.views),0) > 0 OR COALESCE(SUM(s.clicks),0) > 0
       ORDER BY clicks DESC, views DESC`,
      [v.from, v.to, v.campaignId],
    )
  ).rows.map((r) => ({
    ...r,
    ctr: r.views ? Math.round((r.clicks / r.views) * 1000) / 10 : 0,
  }));
  const days = (
    await db().query<{ day: string; views: number; clicks: number }>(
      `SELECT to_char(s.day,'YYYY-MM-DD') AS day,SUM(s.views)::int AS views,SUM(s.clicks)::int AS clicks
       FROM jdatna.ad_stats_daily s JOIN jdatna.ads a ON a.id=s.ad_id
       WHERE s.day BETWEEN $1 AND $2 AND ($3='' OR a.campaign_id::text=$3)
       GROUP BY s.day ORDER BY s.day`,
      [v.from, v.to, v.campaignId],
    )
  ).rows;
  // المدة بعد التحقق منها (اسم ملف CSV منها، لا من الطلب).
  return { rows, days, from: v.from, to: v.to };
}
/** التقرير ملف CSV يفتح في Excel بالعربية (BOM). */
export function reportCsv(rows: Awaited<ReturnType<typeof adsReport>>["rows"]) {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    // لا تبدأ خلية بصيغة (=+-@) فتُنفَّذ في Excel.
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    ["الإعلان", "الحملة", "المشاهدات", "النقرات", "نسبة النقر %"],
    ...rows.map((r) => [
      r.title,
      r.campaignName ?? "",
      r.views,
      r.clicks,
      r.ctr,
    ]),
  ].map((r) => r.map(cell).join(","));
  return "﻿" + lines.join("\r\n");
}
