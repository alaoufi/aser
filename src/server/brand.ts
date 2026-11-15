import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { brandIds, isPremium, resolveBrand } from "../lib/brand";
import { can } from "../lib/permissions";
import { db } from "./db";
import { HttpError } from "./security";

/** هوية الأسرة الحالية (المختارة أو الافتراضية المشتقة من معرّفها). */
export async function ownBrand(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT p.id,b.palette,b.pattern,b.effect,b.scale,COALESCE(b.tier,'free') AS tier
       FROM jdatna.producer_profiles p LEFT JOIN jdatna.producer_brand b ON b.producer_id=p.id WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "سجّل ملف الأسرة المنتجة أولًا");
  const b = resolveBrand(row.id, row);
  return {
    producerId: row.id as string,
    palette: b.palette.id,
    pattern: b.pattern.id,
    effect: b.effect.id,
    scale: b.scale.id,
    chosen: Boolean(row.palette),
    tier: row.tier as "free" | "pro",
  };
}

const brandSchema = z
  .object({
    palette: z.enum(brandIds.palettes),
    pattern: z.enum(brandIds.patterns),
    effect: z.enum(brandIds.effects),
    scale: z.number().int().min(1).max(3),
  })
  .strict();

/** اختيار الهوية: لا يعيد الملف للمراجعة، ويسري على بطاقة الأسرة وكل منتجاتها. */
export async function saveBrand(user: SessionUser, input: unknown) {
  const v = brandSchema.parse(input);
  const current = await ownBrand(user);
  // المكتبة المميزة معزولة للهويات المدفوعة.
  if (isPremium(v) && current.tier !== "pro")
    throw new HttpError(
      402,
      "هذه من مكتبة الهويات المميزة، وستتاح قريبًا ضمن الهوية الاحترافية",
    );
  await db().query(
    `INSERT INTO jdatna.producer_brand(producer_id,palette,pattern,effect,scale) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(producer_id) DO UPDATE SET palette=EXCLUDED.palette,pattern=EXCLUDED.pattern,
       effect=EXCLUDED.effect,scale=EXCLUDED.scale,updated_at=now()`,
    [current.producerId, v.palette, v.pattern, v.effect, v.scale],
  );
  return ownBrand(user);
}

/** هوية القسم (إطاره): تختارها الإدارة، وتظهر في حدود بطاقات منتجاته. */
export async function saveCategoryFrame(user: SessionUser, input: unknown) {
  if (!can(user, "categories"))
    throw new HttpError(403, "لا تملك صلاحية الأقسام");
  const v = z
    .object({ id: z.string().min(1).max(50), frame: z.enum(brandIds.frames) })
    .strict()
    .parse(input);
  const r = await db().query(
    `INSERT INTO jdatna.category_identity(category_id,frame,updated_by)
     SELECT id,$2,$3 FROM jdatna.categories WHERE id=$1
     ON CONFLICT(category_id) DO UPDATE SET frame=EXCLUDED.frame,updated_by=EXCLUDED.updated_by,updated_at=now()`,
    [v.id, v.frame, user.id],
  );
  if (!r.rowCount) throw new HttpError(404, "القسم غير موجود");
  return { id: v.id, frame: v.frame };
}
