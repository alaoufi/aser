import { z } from "zod";
import type { SessionUser } from "../lib/types";
import {
  resolveTable,
  tableDimensions,
  type FamilyTableDesign,
} from "../lib/family-table";
import { db } from "./db";
import { HttpError } from "./security";

const oneOf = <T extends readonly string[]>(l: T) =>
  z.enum(l as unknown as [T[number], ...T[number][]]);
const tableSchema = z
  .object({
    shape: oneOf(tableDimensions.shape),
    height: oneOf(tableDimensions.height),
    finish: oneOf(tableDimensions.finish),
    ornament: oneOf(tableDimensions.ornament),
    frame: oneOf(tableDimensions.frame),
    display: oneOf(tableDimensions.display),
    welcome: z.string().max(200).optional(),
  })
  .strict();

/**
 * عبارة الأسرة على مائدتها: سطر قصير (40 حرفًا) بلا روابط ولا أرقام جوال ولا رموز برمجية.
 * الفارغة تعني الافتراضية «حياكم الله».
 */
export function cleanWelcome(input: string | undefined): string | null {
  const v = (input ?? "")
    .replace(
      /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return null;
  if (v.length > 40)
    throw new HttpError(400, "العبارة طويلة؛ اكتبها في 40 حرفًا أو أقل");
  if (/[<>{}]|https?:|www\.|\.(com|net|sa|org)\b|@/i.test(v))
    throw new HttpError(400, "العبارة بلا روابط ولا عناوين");
  if (/[0-9٠-٩]{5,}/.test(v.replace(/[\s-]/g, "")))
    throw new HttpError(400, "العبارة بلا أرقام جوال");
  return v;
}

/** مائدة الأسرة المعروضة في صفحتها (الافتراضية إن لم تختر). */
export async function getFamilyTable(
  producerId: string,
): Promise<{ design: FamilyTableDesign; welcome: string | null }> {
  const row = (
    await db().query(
      "SELECT shape,height,finish,ornament,frame,display,welcome FROM jdatna.producer_table WHERE producer_id=$1",
      [producerId],
    )
  ).rows[0];
  return { design: resolveTable(row), welcome: row?.welcome ?? null };
}

/** مائدة الأسرة للوحتها، ومعها أول أطباقها للمعاينة. */
export async function ownFamilyTable(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT p.id,COALESCE(p.trade_name,p.name) AS name,t.shape,t.height,t.finish,t.ornament,t.frame,t.display,t.welcome
       FROM jdatna.producer_profiles p LEFT JOIN jdatna.producer_table t ON t.producer_id=p.id WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  const dishes = (
    await db().query(
      `SELECT id,name,image_url AS "imageUrl" FROM jdatna.products
       WHERE producer_id=$1 AND visible AND deleted_at IS NULL ORDER BY (status='available') DESC,created_at DESC LIMIT 8`,
      [row.id],
    )
  ).rows as { id: string; name: string; imageUrl: string | null }[];
  return {
    name: row.name as string,
    chosen: Boolean(row.shape),
    table: resolveTable(row),
    welcome: (row.welcome as string | null) ?? "",
    dishes,
  };
}

/** اختيار المائدة: لا يعيد الملف للمراجعة، ويظهر في صفحة الأسرة مباشرة. */
export async function saveFamilyTable(user: SessionUser, input: unknown) {
  const v = tableSchema.parse(input);
  const welcome = cleanWelcome(v.welcome);
  const r = await db().query(
    `INSERT INTO jdatna.producer_table(producer_id,shape,height,finish,ornament,frame,display,welcome)
     SELECT id,$2,$3,$4,$5,$6,$7,$8 FROM jdatna.producer_profiles WHERE user_id=$1
     ON CONFLICT(producer_id) DO UPDATE SET shape=EXCLUDED.shape,height=EXCLUDED.height,finish=EXCLUDED.finish,
       ornament=EXCLUDED.ornament,frame=EXCLUDED.frame,display=EXCLUDED.display,welcome=EXCLUDED.welcome,updated_at=now()`,
    [
      user.id,
      v.shape,
      v.height,
      v.finish,
      v.ornament,
      v.frame,
      v.display,
      welcome,
    ],
  );
  if (!r.rowCount) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return ownFamilyTable(user);
}
