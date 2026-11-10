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
