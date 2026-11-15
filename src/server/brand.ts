import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { brandPaletteIds, paletteFor } from "../lib/brand";
import { db } from "./db";
import { HttpError } from "./security";

/** هوية الأسرة الحالية (المختارة أو الافتراضية المشتقة). */
export async function ownBrand(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT p.id,b.palette,COALESCE(b.tier,'free') AS tier FROM jdatna.producer_profiles p
       LEFT JOIN jdatna.producer_brand b ON b.producer_id=p.id WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return {
    producerId: row.id as string,
    palette: paletteFor(row.id, row.palette).id,
    chosen: Boolean(row.palette),
    tier: row.tier as "free" | "pro",
  };
}

/** اختيار لون الهوية: لا يعيد الملف للمراجعة، ويسري على بطاقة الأسرة وكل منتجاتها. */
export async function saveBrand(user: SessionUser, input: unknown) {
  const { palette } = z
    .object({ palette: z.enum(brandPaletteIds) })
    .strict()
    .parse(input);
  const r = await db().query(
    `INSERT INTO jdatna.producer_brand(producer_id,palette)
     SELECT id,$2 FROM jdatna.producer_profiles WHERE user_id=$1
     ON CONFLICT(producer_id) DO UPDATE SET palette=EXCLUDED.palette,updated_at=now()`,
    [user.id, palette],
  );
  if (!r.rowCount) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  return ownBrand(user);
}
