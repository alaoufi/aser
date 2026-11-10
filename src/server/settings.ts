import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, databaseConfigured, transaction } from "./db";
import { HttpError } from "./security";

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
