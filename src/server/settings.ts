import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, databaseConfigured, transaction } from "./db";
import { HttpError } from "./security";
import {
  isSiteTextKey,
  siteTextDefaults,
  type SiteTexts,
} from "../lib/site-texts";

export const siteTemplates = ["najdi", "classic"] as const;
export type SiteTemplate = (typeof siteTemplates)[number];
const fallback: SiteTemplate = "najdi";

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

export async function setSiteTemplate(user: SessionUser, input: unknown) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الإدارة");
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

/** نصوص الواجهة: الأصلية مع ما عدّلته الإدارة («» = محذوف). */
export async function getSiteTexts(): Promise<SiteTexts> {
  const texts: SiteTexts = { ...siteTextDefaults };
  if (!databaseConfigured()) return texts;
  try {
    const rows = (
      await db().query(
        "SELECT substr(key,6) AS key,value FROM jdatna.site_settings WHERE key LIKE 'text:%'",
      )
    ).rows as { key: string; value: string }[];
    for (const row of rows)
      if (isSiteTextKey(row.key)) texts[row.key] = row.value;
  } catch {
    // عند تعذر القراءة تبقى النصوص الأصلية.
  }
  return texts;
}

/** قائمة الإدارة: لكل نص قيمته الحالية والأصلية وهل عُدِّل. */
export async function adminSiteTexts(user: SessionUser) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const current = await getSiteTexts();
  return (Object.keys(siteTextDefaults) as (keyof SiteTexts)[]).map((key) => ({
    key,
    value: current[key],
    original: siteTextDefaults[key],
    edited: current[key] !== siteTextDefaults[key],
  }));
}

/** تعديل نص أو حذفه («») أو إعادته للأصل (null). */
export async function setSiteText(user: SessionUser, input: unknown) {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const { key, value } = z
    .object({
      key: z.string().refine(isSiteTextKey, "نص غير معروف"),
      value: z.string().trim().max(2000).nullable(),
    })
    .strict()
    .parse(input);
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
