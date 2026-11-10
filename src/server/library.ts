import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { storage } from "./storage";
import { HttpError, encryptDocument } from "./security";
import { prepareProductImage } from "./media";

export type LibraryPhoto = {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  url: string;
  usedBy: number;
};

/** أسرة المستخدم الصالحة لإدارة المكتبة (ليست موقوفة أو مرفوضة). */
async function ownProducer(user: SessionUser) {
  const row = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status NOT IN ('suspended','rejected')",
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(403, "مكتبة الصور للأسر المنتجة المسجلة فقط");
  return row.id as string;
}

const details = z.object({
  name: z.string().trim().min(2, "اكتب اسم الطبق").max(120),
  description: z.string().trim().max(2000).default(""),
  categoryId: z.string().min(1).max(30).nullable().optional(),
});

/** القسم يجب أن يكون من أقسام الأسرة. */
async function assertFamilyCategory(
  producerId: string,
  categoryId?: string | null,
) {
  if (!categoryId) return;
  const ok = (
    await db().query(
      "SELECT 1 FROM jdatna.producer_categories WHERE producer_id=$1 AND category_id=$2",
      [producerId, categoryId],
    )
  ).rowCount;
  if (!ok) throw new HttpError(400, "اختر القسم من أقسام أسرتك");
}

export async function listLibrary(user: SessionUser): Promise<LibraryPhoto[]> {
  const producerId = await ownProducer(user);
  return (
    await db().query(
      `SELECT l.id,l.name,l.description,l.category_id AS "categoryId",'/api/media/'||l.id AS url,
        (SELECT count(*)::int FROM jdatna.products x WHERE x.producer_id=l.producer_id AND x.image_url='/api/media/'||l.id) AS "usedBy"
       FROM jdatna.photo_library l WHERE l.producer_id=$1 ORDER BY l.created_at DESC LIMIT 500`,
      [producerId],
    )
  ).rows;
}

export async function addLibraryPhoto(
  user: SessionUser,
  file: File,
  input: unknown,
) {
  const producerId = await ownProducer(user);
  const value = details.parse(input);
  await assertFamilyCategory(producerId, value.categoryId);
  const data = await prepareProductImage(file);
  const id = randomUUID(),
    key = "private/photo-library/" + id;
  const client = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: encryptDocument(
        data,
        Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY!, "hex"),
      ),
      ContentType: "application/octet-stream",
      ServerSideEncryption: "AES256",
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  try {
    await db().query(
      "INSERT INTO jdatna.photo_library(id,producer_id,name,description,category_id,object_key,size) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        producerId,
        value.name,
        value.description,
        value.categoryId ?? null,
        key,
        data.length,
      ],
    );
  } catch (error) {
    await client
      .send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      )
      .catch(() => {});
    throw error;
  }
  return { id, url: "/api/media/" + id };
}

export async function updateLibraryPhoto(user: SessionUser, input: unknown) {
  const producerId = await ownProducer(user);
  const value = details.extend({ id: z.uuid() }).parse(input);
  await assertFamilyCategory(producerId, value.categoryId);
  const updated = await db().query(
    "UPDATE jdatna.photo_library SET name=$3,description=$4,category_id=$5 WHERE id=$1 AND producer_id=$2",
    [
      value.id,
      producerId,
      value.name,
      value.description,
      value.categoryId ?? null,
    ],
  );
  if (!updated.rowCount) throw new HttpError(404, "الصورة غير موجودة");
  return { ok: true };
}

/** لا تُحذف صورة يستخدمها منتج؛ تُستبدل صورة المنتج أولًا. */
export async function deleteLibraryPhoto(user: SessionUser, input: unknown) {
  const producerId = await ownProducer(user);
  const { id } = z.object({ id: z.uuid() }).parse(input);
  const key = await transaction(async (client) => {
    const photo = (
      await client.query(
        "SELECT object_key FROM jdatna.photo_library WHERE id=$1 AND producer_id=$2 FOR UPDATE",
        [id, producerId],
      )
    ).rows[0];
    if (!photo) throw new HttpError(404, "الصورة غير موجودة");
    const used = (
      await client.query(
        "SELECT count(*)::int AS n FROM jdatna.products WHERE image_url=$1",
        ["/api/media/" + id],
      )
    ).rows[0].n;
    if (used)
      throw new HttpError(
        409,
        `الصورة مستخدمة في ${used} منتج؛ غيّر صورة المنتج أولًا`,
      );
    await client.query("DELETE FROM jdatna.photo_library WHERE id=$1", [id]);
    return photo.object_key as string;
  });
  await storage()
    .send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      {
        abortSignal: AbortSignal.timeout(15000),
      },
    )
    .catch(() => {});
  return { ok: true };
}

/** صورة من المكتبة للعرض: لصاحبها والإدارة، وللجميع إذا استخدمها منتج منشور لأسرة معتمدة. */
export async function libraryMedia(id: string, user: SessionUser | null) {
  const row = (
    await db().query(
      `SELECT l.object_key,l.mime,p.user_id,
        EXISTS(SELECT 1 FROM jdatna.products x JOIN jdatna.producer_profiles xp ON xp.id=x.producer_id
          WHERE x.image_url='/api/media/'||l.id AND x.visible AND xp.status='approved') AS public
       FROM jdatna.photo_library l JOIN jdatna.producer_profiles p ON p.id=l.producer_id WHERE l.id=$1`,
      [id],
    )
  ).rows[0];
  if (!row) return null;
  if (!(row.public || user?.id === row.user_id || user?.role === "admin"))
    throw new HttpError(404, "الصورة غير موجودة");
  return { objectKey: row.object_key as string, mime: row.mime as string };
}
