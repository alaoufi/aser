import { randomUUID } from "node:crypto";
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
  defaultProductFields,
  isProductFieldKey,
  type ProductFields,
} from "../lib/product-fields";

export const siteTemplates = ["najdi", "classic"] as const;
export type SiteTemplate = (typeof siteTemplates)[number];
const fallback: SiteTemplate = "classic";

/** قالب الواجهة الحالي؛ أي خطأ في القراءة يعيد القالب الافتراضي ولا يوقف الصفحة. */
export async function getSiteTemplate(): Promise<SiteTemplate> {
  if (!databaseConfigured()) return fallback;
  try {
    const value = (
      await db().query(
        "SELECT value FROM jdatna.site_settings WHERE key='template'",
      )
    ).rows[0]?.value;
    return siteTemplates.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** قالب هذا الزائر: اختياره المحفوظ في جهازه، وإلا قالب الإدارة الافتراضي. */
export async function visitorTemplate(): Promise<SiteTemplate> {
  const { cookies } = await import("next/headers");
  const chosen = (await cookies()).get("jdatna_template")?.value;
  return siteTemplates.includes(chosen as SiteTemplate)
    ? (chosen as SiteTemplate)
    : getSiteTemplate();
}

export async function setSiteTemplate(user: SessionUser, input: unknown) {
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const { template } = z
    .object({ template: z.enum(siteTemplates) })
    .strict()
    .parse(input);
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES('template',$1,now(),$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
      [template, user.id],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'site.template',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ template })],
    );
    return { template };
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
export async function getSiteTexts(): Promise<SiteTexts> {
  const { texts, hidden } = await storedSiteTexts();
  for (const key of hidden) texts[key] = "";
  return texts;
}

/** قائمة الإدارة: لكل نص قيمته الحالية والأصلية وهل عُدِّل وهل هو مخفي. */
export async function adminSiteTexts(user: SessionUser) {
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
};
const emptyAppLinks: AppLinks = {
  androidPackage: "",
  androidFingerprints: [],
  iosAppIds: [],
};
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
  })
  .strict();

export async function getAppLinks(): Promise<AppLinks> {
  if (!databaseConfigured()) return emptyAppLinks;
  try {
    const raw = (
      await db().query(
        "SELECT value FROM jdatna.site_settings WHERE key='app:links'",
      )
    ).rows[0]?.value;
    return raw ? appLinksSchema.parse(JSON.parse(raw)) : emptyAppLinks;
  } catch {
    return emptyAppLinks;
  }
}

export async function setAppLinks(user: SessionUser, input: unknown) {
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
  if (!can(user, "categories"))
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
