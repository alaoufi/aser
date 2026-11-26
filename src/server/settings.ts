import { randomUUID } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, databaseConfigured, transaction } from "./db";
import { HttpError } from "./security";
import { can } from "../lib/permissions";
import {
  isSiteTextKey,
  siteTextDefaults,
  type SiteTexts,
} from "../lib/site-texts";
import {
  PALETTE_COOKIE,
  TEMPLATE_COOKIE,
  defaultAppearanceSettings,
  normalizeAppearance,
  paletteKeys,
  resolveAppearance,
  siteTemplates,
  type AppearanceSettings,
  type PaletteKey,
  type SiteTemplate,
} from "../lib/appearance";
import {
  defaultProductFields,
  isProductFieldKey,
  type ProductFields,
} from "../lib/product-fields";

export { siteTemplates, type SiteTemplate } from "../lib/appearance";

const appearanceKeys = [
  "template",
  "templates",
  "palette",
  "palettes",
] as const;

/**
 * إعداد «المظهر» من الإدارة: القالب واللون الافتراضيان، والقوالب والألوان المتاحة للزائر.
 * أي خطأ في القراءة يعيد الأصل (الكلاسيكي والسدو، والكل متاح) ولا يوقف الصفحة.
 * تُقرأ مرة واحدة لكل طلب صفحة.
 */
export const getAppearanceSettings = cache(
  async (): Promise<AppearanceSettings> => {
    if (!databaseConfigured()) return defaultAppearanceSettings;
    try {
      const rows = (
        await db().query(
          "SELECT key,value FROM jdatna.site_settings WHERE key = ANY($1::text[])",
          [appearanceKeys],
        )
      ).rows as { key: (typeof appearanceKeys)[number]; value: string }[];
      const raw: Partial<Record<keyof AppearanceSettings, unknown>> = {};
      for (const r of rows)
        raw[r.key] =
          r.key === "templates" || r.key === "palettes"
            ? r.value.split(",").filter(Boolean)
            : r.value;
      return normalizeAppearance(raw);
    } catch {
      return defaultAppearanceSettings;
    }
  },
);

/** قالب الإدارة الافتراضي (للتوافق مع ما يطلبه وحده). */
export async function getSiteTemplate(): Promise<SiteTemplate> {
  return (await getAppearanceSettings()).template;
}

/** مظهر هذا الزائر: اختياره المحفوظ في cookie إن كان متاحًا، وإلا افتراضي الإدارة. */
export const visitorAppearance = cache(async () => {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const settings = await getAppearanceSettings();
  return {
    ...resolveAppearance(settings, {
      template: jar.get(TEMPLATE_COOKIE)?.value,
      palette: jar.get(PALETTE_COOKIE)?.value,
    }),
    settings,
  };
});

/** قالب هذا الزائر: اختياره المحفوظ في جهازه، وإلا قالب الإدارة الافتراضي. */
export async function visitorTemplate(): Promise<SiteTemplate> {
  return (await visitorAppearance()).template;
}

const appearanceInput = z
  .object({
    template: z.enum(siteTemplates),
    templates: z.array(z.enum(siteTemplates)).min(1).max(10).optional(),
    palette: z.enum(paletteKeys as [PaletteKey, ...PaletteKey[]]).optional(),
    palettes: z
      .array(z.enum(paletteKeys as [PaletteKey, ...PaletteKey[]]))
      .min(1)
      .max(20)
      .optional(),
  })
  .strict();

/** الإدارة: القالب الافتراضي (ومعه اختياريًا المتاح والألوان). الافتراضي يُضاف للمتاح دائمًا. */
export async function setSiteTemplate(user: SessionUser, input: unknown) {
  if (!can(user, "template"))
    throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const parsed = appearanceInput.parse(input);
  const current = await getAppearanceSettings();
  const next = normalizeAppearance({ ...current, ...parsed });
  return transaction(async (client) => {
    // يُكتب ما غيّرته الإدارة فقط؛ الافتراضي يُضاف للمتاح عند القراءة (normalizeAppearance).
    for (const key of appearanceKeys) {
      if (parsed[key] === undefined) continue;
      const value = Array.isArray(next[key])
        ? (next[key] as string[]).join(",")
        : (next[key] as string);
      await client.query(
        `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
        [key, value, user.id],
      );
    }
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.template',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify(next)],
    );
    return next;
  });
}

/** النصوص المخزنة (المعدّلة) والمخفية مؤقتًا دون حذف نصها. */
async function storedSiteTexts() {
  const texts: SiteTexts = { ...siteTextDefaults };
  const hidden = new Set<keyof SiteTexts>();
  if (!databaseConfigured()) return { texts, hidden };
  try {
    const rows = (
      await db().query(
        "SELECT key,value FROM jdatna.site_settings WHERE key LIKE 'text:%' OR key LIKE 'hidden:%'",
      )
    ).rows as { key: string; value: string }[];
    for (const row of rows) {
      const [kind, key] = [
        row.key.slice(0, row.key.indexOf(":")),
        row.key.slice(row.key.indexOf(":") + 1),
      ];
      if (!isSiteTextKey(key)) continue;
      if (kind === "text") texts[key] = row.value;
      else if (kind === "hidden") hidden.add(key);
    }
  } catch {
    // عند تعذر القراءة تبقى النصوص الأصلية.
  }
  return { texts, hidden };
}

/** نصوص الواجهة: الأصلية مع ما عدّلته الإدارة («» = محذوف أو مخفي). */
/** تُقرأ مرة واحدة لكل طلب صفحة (القالب والصفحة يطلبانها معًا). */
export const getSiteTexts = cache(async (): Promise<SiteTexts> => {
  const { texts, hidden } = await storedSiteTexts();
  for (const key of hidden) texts[key] = "";
  return texts;
});

/** قائمة الإدارة: لكل نص قيمته الحالية والأصلية وهل عُدِّل وهل هو مخفي. */
export async function adminSiteTexts(user: SessionUser) {
  if (!can(user, "texts")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const { texts: current, hidden } = await storedSiteTexts();
  return (Object.keys(siteTextDefaults) as (keyof SiteTexts)[]).map((key) => ({
    key,
    value: current[key],
    original: siteTextDefaults[key],
    edited: current[key] !== siteTextDefaults[key],
    hidden: hidden.has(key),
  }));
}

/** تعديل نص أو حذفه («») أو إعادته للأصل (null). */
export async function setSiteText(user: SessionUser, input: unknown) {
  if (!can(user, "texts")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const parsed = z
    .union([
      z
        .object({
          key: z.string().refine(isSiteTextKey, "نص غير معروف"),
          value: z.string().trim().max(2000).nullable(),
        })
        .strict(),
      z
        .object({
          key: z.string().refine(isSiteTextKey, "نص غير معروف"),
          hidden: z.boolean(),
        })
        .strict(),
    ])
    .parse(input);
  const key = parsed.key;
  // الإخفاء لا يمس النص: يُخفى من الموقع ويعود كما هو عند الإظهار.
  if ("hidden" in parsed)
    return transaction(async (client) => {
      if (parsed.hidden)
        await client.query(
          `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,'1',now(),$2)
           ON CONFLICT(key) DO UPDATE SET updated_at=now(),updated_by=EXCLUDED.updated_by`,
          ["hidden:" + key, user.id],
        );
      else
        await client.query("DELETE FROM jdatna.site_settings WHERE key=$1", [
          "hidden:" + key,
        ]);
      await client.query(
        "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.text',NULL,$3)",
        [randomUUID(), user.id, JSON.stringify({ key, hidden: parsed.hidden })],
      );
      return { key, hidden: parsed.hidden };
    });
  const value = parsed.value;
  return transaction(async (client) => {
    if (value === null)
      await client.query("DELETE FROM jdatna.site_settings WHERE key=$1", [
        "text:" + key,
      ]);
    else
      await client.query(
        `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
        ["text:" + key, value, user.id],
      );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.text',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ key, value })],
    );
    return { key, value: value ?? siteTextDefaults[key as keyof SiteTexts] };
  });
}

/** ربط تطبيقي الجوال بالموقع: يُعبَّأ من الإدارة بعد إنشاء التطبيق في المتجر. */
export type AppLinks = {
  androidPackage: string;
  androidFingerprints: string[];
  iosAppIds: string[];
  /** زر «حمّل من App Store» أسفل الموقع: يفعّله المالك بعد موافقة Apple ونشر التطبيق. */
  showAppStore: boolean;
  /** زر «احصل عليه من Google Play» أسفل الموقع: بعد موافقة Google ونشر التطبيق. */
  showPlayStore: boolean;
};
const emptyAppLinks: AppLinks = {
  androidPackage: "",
  androidFingerprints: [],
  iosAppIds: [],
  showAppStore: false,
  showPlayStore: false,
};
/** صفحتا التطبيق في المتجرين (App Store: رقم التطبيق 6833382132).
 * رابط App Store بالمتجر السعودي `/sa/`: التطبيق منشور فيه وحده، والرابط بلا دولة يرجع 404 خارجه (مراجعة 2026-11-24). */
export const APP_STORE_URL = "https://apps.apple.com/sa/app/id6833382132";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.jdatna.app";
/**
 * تطبيق أندرويد المنشور في Google Play: اسم الحزمة وبصمتا الشهادتين ثابتة في الكود،
 * فيُربط التطبيق بالموقع (يفتح كاملًا بلا شريط المتصفح) دون أي إدخال في الإدارة.
 * - مفتاح توقيع Google Play (للنسخة المثبتة من المتجر).
 * - مفتاح الرفع (للنسخة المثبتة مباشرة من ملف APK للتجربة).
 * أي بصمة تُضاف من «الإدارة ← تطبيق الجوال» تُضم إليهما.
 */
const PLAY_ANDROID_PACKAGE = "com.jdatna.app";
const PLAY_ANDROID_FINGERPRINTS = [
  "44:E3:68:B2:E0:67:D3:ED:83:C3:A6:71:32:2F:08:84:15:A8:3D:03:D3:3A:6A:EA:F3:83:B7:CC:95:69:BA:3C",
  "6B:DB:F8:75:9A:D3:D2:6C:7C:37:70:C5:97:D0:AA:F0:D6:C6:68:8C:C5:9F:F3:C0:41:B9:B7:08:5A:49:B7:20",
];
/** تطبيق الآيفون في App Store: رقم فريق آبل ومعرّف الحزمة (ملف apple-app-site-association). */
const APP_STORE_IOS_ID = "F6RN596WCX.com.jdatna.app";
/**
 * هل صفحة التطبيق في Google Play منشورة؟ يُفحص من الخادم مرة كل ساعة على الأكثر وفي الخلفية
 * (لا ينتظره أي طلب)، فيظهر زر Google Play أسفل الموقع وحده فور موافقة Google ونشر التطبيق.
 * قبل أول نتيجة، أو عند تعذّر الفحص، يُعدّ غير منشور (الرابط قبل النشر يفتح «غير موجود»).
 */
const playListing = { live: false, checkedAt: 0, checking: false };
export function playStoreLive(): boolean {
  const stale = Date.now() - playListing.checkedAt > 60 * 60 * 1000;
  if (stale && !playListing.checking) {
    playListing.checking = true;
    fetch(PLAY_STORE_URL + "&hl=ar&gl=SA", {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => {
        playListing.live = r.status === 200;
        return r.body?.cancel();
      })
      .catch(() => {})
      .finally(() => {
        playListing.checkedAt = Date.now();
        playListing.checking = false;
      });
  }
  return playListing.live;
}
function withPlayApp(saved: AppLinks): AppLinks {
  // تطبيق الآيفون منشور في App Store منذ 2026-11-14: زره ظاهر دائمًا. وزر Google Play بتفعيل
  // المالك أو تلقائيًا حين تُنشر صفحة التطبيق في المتجر.
  const links = {
    ...saved,
    showAppStore: true,
    showPlayStore: saved.showPlayStore || playStoreLive(),
  };
  const iosAppIds = links.iosAppIds.includes(APP_STORE_IOS_ID)
    ? links.iosAppIds
    : [...links.iosAppIds, APP_STORE_IOS_ID];
  const pkg = links.androidPackage || PLAY_ANDROID_PACKAGE;
  if (pkg !== PLAY_ANDROID_PACKAGE) return { ...links, iosAppIds };
  const prints = [...links.androidFingerprints];
  for (const f of PLAY_ANDROID_FINGERPRINTS)
    if (!prints.some((x) => x.toUpperCase() === f)) prints.push(f);
  return {
    ...links,
    androidPackage: pkg,
    androidFingerprints: prints,
    iosAppIds,
  };
}
const appLinksSchema = z
  .object({
    androidPackage: z
      .string()
      .trim()
      .regex(/^$|^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/, "اسم الحزمة غير صالح"),
    androidFingerprints: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, "بصمة SHA-256 غير صالحة"),
      )
      .max(5),
    iosAppIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Z0-9]{10}\.[a-zA-Z0-9.-]+$/, "معرّف تطبيق آبل غير صالح"),
      )
      .max(5),
    showAppStore: z.boolean().default(false),
    showPlayStore: z.boolean().default(false),
  })
  .strict();

export async function getAppLinks(): Promise<AppLinks> {
  if (!databaseConfigured()) return withPlayApp(emptyAppLinks);
  try {
    const raw = (
      await db().query(
        "SELECT value FROM jdatna.site_settings WHERE key='app:links'",
      )
    ).rows[0]?.value;
    return withPlayApp(
      raw ? appLinksSchema.parse(JSON.parse(raw)) : emptyAppLinks,
    );
  } catch {
    return withPlayApp(emptyAppLinks);
  }
}

export async function setAppLinks(user: SessionUser, input: unknown) {
  if (!can(user, "app")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const value = appLinksSchema.parse(input);
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES('app:links',$1,now(),$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [JSON.stringify(value), user.id],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.app-links',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify(value)],
    );
    return value;
  });
}

/** حالة حقول نموذج المنتج (ظاهر/مخفي/محذوف)؛ أي خطأ يعيدها كلها ظاهرة. */
export async function getProductFields(): Promise<ProductFields> {
  const fields = defaultProductFields();
  if (!databaseConfigured()) return fields;
  try {
    const raw = (
      await db().query(
        "SELECT value FROM jdatna.site_settings WHERE key='product:fields'",
      )
    ).rows[0]?.value;
    const stored = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    for (const [k, v] of Object.entries(stored))
      if (isProductFieldKey(k) && (v === "hidden" || v === "deleted"))
        fields[k] = v;
  } catch {
    // تبقى الحقول ظاهرة.
  }
  return fields;
}

/** إخفاء حقل من نموذج المنتج أو حذفه أو إعادته. */
export async function setProductField(user: SessionUser, input: unknown) {
  if (!can(user, "product-fields"))
    throw new HttpError(403, "لا تملك صلاحية إدارة الأقسام");
  const { key, state } = z
    .object({
      key: z.string().refine(isProductFieldKey, "حقل غير معروف"),
      state: z.enum(["shown", "hidden", "deleted"]),
    })
    .strict()
    .parse(input);
  const fields = await getProductFields();
  fields[key as keyof ProductFields] = state;
  const stored = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== "shown"),
  );
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES('product:fields',$1,now(),$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [JSON.stringify(stored), user.id],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'product.field',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ key, state })],
    );
    return fields;
  });
}

/**
 * إثبات ملكية النطاق لدى المركز السعودي للأعمال (طريقة Meta Tag): رمز يضعه المالك من
 * «الإدارة ← إثبات ملكية النطاق»، فيظهر في <head> كل صفحة:
 *   <meta name="domain-verification" content="الرمز">
 * الرمز عام بطبيعته (يظهر في مصدر الصفحة)، فلا سر فيه.
 */
const DOMAIN_VERIFICATION_KEY = "verify:domain";
/**
 * رمز jdatna.com لدى المركز السعودي للأعمال (الرمز الثاني الذي أرسله المالك 2026-11-21 بعد تعديل التوثيق في المنصة).
 * يظهر ما لم يحفظ المالك رمزًا آخر من الإدارة.
 */
const DOMAIN_VERIFICATION_DEFAULT =
  "3007acd4be257a0dc8ad617c6e49eb126d3ca8ea713b6f1f1455050fd8380cf5";
/**
 * رموز ثابتة في الكود تظهر دائمًا مع رمز الإدارة (طلب المالك 2026-11-23: «هذا الكود تضيفه على الكود»).
 * الرمز الذي أرسله المالك 2026-11-23 للمركز السعودي للأعمال (لنطاق jdtna.sa).
 */
export const DOMAIN_VERIFICATION_FIXED = [
  "fe7d1c310cddeda07c92b84334ce1e570264715ccc2dc4621c5b348d2fd40926",
];
/** كل رموز إثبات الملكية في الصفحة: رمز الإدارة (أو الافتراضي) ثم الثابتة، بلا تكرار. */
// cache: الصفحة تطلبه مرتين (metadata والـ layout)، فيُقرأ من القاعدة مرة واحدة لكل طلب.
export const getDomainVerifications = cache(async (): Promise<string[]> => {
  const stored = await getDomainVerification();
  return [...new Set([stored, ...DOMAIN_VERIFICATION_FIXED])].filter((c) =>
    /^[A-Za-z0-9._:-]+$/.test(c),
  );
});
export async function getDomainVerification(): Promise<string> {
  if (!databaseConfigured()) return DOMAIN_VERIFICATION_DEFAULT;
  try {
    return (
      (
        await db().query(
          "SELECT value FROM jdatna.site_settings WHERE key=$1",
          [DOMAIN_VERIFICATION_KEY],
        )
      ).rows[0]?.value ?? DOMAIN_VERIFICATION_DEFAULT
    );
  } catch {
    return DOMAIN_VERIFICATION_DEFAULT;
  }
}
/** يقبل الرمز وحده أو الوسم كاملًا كما تنسخه المنصة؛ النص الفارغ يحذف الوسم. */
export function parseDomainVerification(input: unknown) {
  const raw = z
    .object({ code: z.string().max(500) })
    .strict()
    .parse(input)
    .code.trim();
  // الوسم كاملًا (content="…")، أو صيغة سجل DNS «domain-verification=…»، أو الرمز وحده.
  const fromTag = raw.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  const fromRecord = raw.match(/^domain-verification\s*=\s*(\S+)$/i)?.[1];
  const code = (fromTag ?? fromRecord ?? raw).trim();
  if (code && !/^[A-Za-z0-9._:-]{8,200}$/.test(code))
    throw new HttpError(
      400,
      "الرمز غير صالح: الصق الرمز أو الوسم كما يظهر في منصة المركز السعودي للأعمال",
    );
  return code;
}
export async function setDomainVerification(user: SessionUser, input: unknown) {
  if (!can(user, "verification"))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  const code = parseDomainVerification(input);
  return transaction(async (client) => {
    if (code)
      await client.query(
        `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
        [DOMAIN_VERIFICATION_KEY, code, user.id],
      );
    else
      await client.query("DELETE FROM jdatna.site_settings WHERE key=$1", [
        DOMAIN_VERIFICATION_KEY,
      ]);
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.domain-verification',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ code })],
    );
    return { code };
  });
}
