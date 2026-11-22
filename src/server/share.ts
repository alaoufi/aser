import { randomInt } from "node:crypto";
import { z } from "zod";
import { SITE_URL } from "@/lib/seo";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * الرابط المختصر للمشاركة: jdtna.sa/s/رمز من 6 حروف، ثابت لكل منتج أو أسرة،
 * يحوّل إلى الصفحة الأصلية (فتبقى الأرشفة وصورة المشاركة على الرابط الأصلي).
 * الحروف بلا المتشابهات (0 وO و1 وl وI) حتى يُكتب الرمز يدويًا بلا خطأ.
 */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
export type ShareKind = "product" | "family";
export const shortUrl = (code: string) => `${SITE_URL}/s/${code}`;

const newCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    "",
  );

/** المنتج الظاهر من أسرة معتمدة، أو الأسرة المعتمدة: وحدها لها رابط مشاركة. */
async function publicTarget(kind: ShareKind, id: string) {
  const sql =
    kind === "product"
      ? `SELECT x.id FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
         WHERE x.id=$1 AND x.visible AND x.deleted_at IS NULL AND p.status='approved'`
      : "SELECT id FROM jdatna.producer_profiles WHERE id=$1 AND status='approved'";
  return Boolean((await db().query(sql, [id])).rowCount);
}

/** رمز المشاركة الثابت (يُنشأ عند أول طلب). */
export async function shareCode(kind: ShareKind, id: string) {
  if (!z.uuid().safeParse(id).success || !(await publicTarget(kind, id)))
    throw new HttpError(404, "لا يمكن مشاركة هذه الصفحة");
  const find = async () =>
    (
      await db().query(
        "SELECT code FROM jdatna.share_links WHERE kind=$1 AND target_id=$2",
        [kind, id],
      )
    ).rows[0]?.code as string | undefined;
  const existing = await find();
  if (existing) return existing;
  for (let i = 0; i < 8; i++) {
    const saved = (
      await db().query(
        "INSERT INTO jdatna.share_links(code,kind,target_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING code",
        [newCode(), kind, id],
      )
    ).rows[0]?.code as string | undefined;
    if (saved) return saved;
    // تعارض: إما سبق إنشاء رمز لنفس الصفحة (طلبان معًا)، أو الرمز مستخدم فنعيد المحاولة.
    const raced = await find();
    if (raced) return raced;
  }
  throw new HttpError(503, "تعذّر إنشاء رابط المشاركة؛ أعد المحاولة");
}

/** رابط المشاركة المختصر، أو null إن تعذّر (فتُشارك الصفحة برابطها الكامل). */
export async function shortLink(kind: ShareKind, id: string) {
  try {
    return shortUrl(await shareCode(kind, id));
  } catch {
    return null;
  }
}

/** يحوّل الرمز إلى مسار الصفحة، أو null إن لم يعد المنتج أو الأسرة متاحًا. */
export async function resolveShare(code: string) {
  if (!/^[2-9a-zA-Z]{6,12}$/.test(code)) return null;
  const row = (
    await db().query(
      `SELECT CASE
         WHEN s.kind='product' THEN (SELECT '/products/'||x.id FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
           WHERE x.id=s.target_id AND x.visible AND x.deleted_at IS NULL AND p.status='approved')
         ELSE (SELECT '/producers/'||p.slug FROM jdatna.producer_profiles p WHERE p.id=s.target_id AND p.status='approved')
       END AS path
       FROM jdatna.share_links s WHERE s.code=$1`,
      [code],
    )
  ).rows[0];
  return (row?.path as string | null | undefined) ?? null;
}
