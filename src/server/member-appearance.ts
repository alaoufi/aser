import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { paletteKeys, siteTemplates, type PaletteKey } from "../lib/appearance";
import { db, databaseConfigured } from "./db";

/** مظهر العضو المسجّل (القالب واللون) محفوظ في حسابه، فيتبعه في أي جهاز يدخل منه. */
export type MemberAppearance = {
  template: string | null;
  palette: string | null;
};

const schema = z
  .object({
    template: z.enum(siteTemplates).optional(),
    palette: z.enum(paletteKeys as [PaletteKey, ...PaletteKey[]]).optional(),
  })
  .strict()
  .refine((v) => v.template || v.palette, "اختر القالب أو اللون");

export async function getMemberAppearance(
  userId: string,
): Promise<MemberAppearance | null> {
  if (!databaseConfigured()) return null;
  const row = (
    await db().query<MemberAppearance>(
      "SELECT template,palette FROM jdatna.member_appearance WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  return row ?? null;
}

export async function saveMemberAppearance(user: SessionUser, input: unknown) {
  const v = schema.parse(input);
  const row = (
    await db().query<MemberAppearance>(
      `INSERT INTO jdatna.member_appearance(user_id,template,palette) VALUES($1,$2,$3)
       ON CONFLICT(user_id) DO UPDATE SET template=COALESCE(EXCLUDED.template,jdatna.member_appearance.template),
         palette=COALESCE(EXCLUDED.palette,jdatna.member_appearance.palette),updated_at=now()
       RETURNING template,palette`,
      [user.id, v.template ?? null, v.palette ?? null],
    )
  ).rows[0];
  return row;
}
