import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { can } from "../lib/permissions";
import {
  maedaColorKeys,
  maedaEdges,
  maedaFinishes,
  maedaShapes,
  usesHidden,
  visibleMaeda,
  type MaedaStyle,
} from "../lib/maeda";
import { db, databaseConfigured } from "./db";
import { HttpError } from "./security";
import { getSiteTexts } from "./settings";

/**
 * «صانع المائدة»: الإدارة تخفي خيارات (maeda:hidden في site_settings)، والأسرة تحفظ مائدتها في
 * producer_profiles.maeda، والصفحة العامة تعرض المحفوظة ما لم تستعمل خيارًا مخفيًا.
 */
const HIDDEN = "maeda:hidden";
const optionKey = z
  .string()
  .regex(/^(runner|(shape|finish|color|edge):[a-z]{1,20})$/);

export async function maedaHidden(): Promise<string[]> {
  if (!databaseConfigured()) return [];
  try {
    const row = (
      await db().query("SELECT value FROM jdatna.site_settings WHERE key=$1", [
        HIDDEN,
      ])
    ).rows[0] as { value: string } | undefined;
    return (row?.value ?? "")
      .split(",")
      .filter((k) => optionKey.safeParse(k).success);
  } catch {
    return [];
  }
}

/** مائدة الأسرة كما تُعرض للزوار (null = السدو الأصلية). أي خطأ يعيد الأصلية ولا يوقف الصفحة. */
export async function publicMaeda(producerId: string) {
  if (!databaseConfigured()) return null;
  try {
    const [row, hidden] = await Promise.all([
      db().query("SELECT maeda FROM jdatna.producer_profiles WHERE id=$1", [
        producerId,
      ]),
      maedaHidden(),
    ]);
    return visibleMaeda(row.rows[0]?.maeda, hidden);
  } catch {
    return null;
  }
}

const styleSchema = z
  .object({
    shape: z.enum(maedaShapes),
    finish: z.enum(maedaFinishes),
    color: z.enum(maedaColorKeys as [string, ...string[]]),
    edge: z.enum(maedaEdges),
    runner: z.boolean(),
  })
  .strict();

async function family(user: SessionUser) {
  const row = (
    await db().query(
      "SELECT id,COALESCE(trade_name,name) AS name,maeda FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0] as
    { id: string; name: string; maeda: MaedaStyle | null } | undefined;
  if (!row)
    throw new HttpError(404, (await getSiteTexts())["maeda.errNoFamily"]);
  return row;
}

/** لوحة الأسرة ← «مائدتي»: المحفوظة والخيارات المخفية واسم الأسرة للمعاينة. */
export async function familyMaeda(user: SessionUser) {
  const f = await family(user);
  const hidden = await maedaHidden();
  return { name: f.name, style: visibleMaeda(f.maeda, hidden), hidden };
}

export async function setFamilyMaeda(user: SessionUser, input: unknown) {
  const f = await family(user);
  const { style } = z
    .object({ style: styleSchema.nullable() })
    .strict()
    .parse(input);
  const hidden = await maedaHidden();
  if (style && usesHidden(style as MaedaStyle, hidden))
    throw new HttpError(400, (await getSiteTexts())["maeda.errHidden"]);
  await db().query("UPDATE jdatna.producer_profiles SET maeda=$2 WHERE id=$1", [
    f.id,
    style ? JSON.stringify(style) : null,
  ]);
  return familyMaeda(user);
}

/** الإدارة ← «قالب الموقع» ← «خيارات المائدة»: المخفي وعدد الأسر لكل خيار مستعمل. */
export async function maedaAdmin(user: SessionUser) {
  if (!can(user, "template"))
    throw new HttpError(403, (await getSiteTexts())["maeda.errAdmin"]);
  const rows = (
    await db().query(
      "SELECT maeda FROM jdatna.producer_profiles WHERE maeda IS NOT NULL",
    )
  ).rows as { maeda: MaedaStyle }[];
  const used: Record<string, number> = {};
  for (const { maeda } of rows) {
    if (!maeda || typeof maeda !== "object") continue;
    for (const axis of ["shape", "finish", "color", "edge"] as const)
      used[`${axis}:${maeda[axis]}`] =
        (used[`${axis}:${maeda[axis]}`] ?? 0) + 1;
    if (maeda.runner) used.runner = (used.runner ?? 0) + 1;
  }
  return { hidden: await maedaHidden(), used };
}

export async function setMaedaHidden(user: SessionUser, input: unknown) {
  if (!can(user, "template"))
    throw new HttpError(403, (await getSiteTexts())["maeda.errAdmin"]);
  const { hidden } = z
    .object({ hidden: z.array(optionKey).max(40) })
    .strict()
    .parse(input);
  await db().query(
    `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
    [HIDDEN, [...new Set(hidden)].join(","), user.id],
  );
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES(gen_random_uuid(),$1,'site.maeda',$2)",
    [user.id, JSON.stringify({ hidden })],
  );
  return maedaAdmin(user);
}
