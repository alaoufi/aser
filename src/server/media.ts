import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { storage } from "./storage";
import {
  HttpError,
  validateDocument,
  encryptDocument,
  decryptDocument,
} from "./security";
export async function prepareProductImage(file: File) {
  if (file.size > 5 * 1024 * 1024)
    throw new HttpError(400, "الحد الأعلى للصورة 5 ميجابايت");
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new HttpError(400, "الصورة يجب أن تكون JPEG أو PNG");
  const input = Buffer.from(await file.arrayBuffer());
  validateDocument(input, file.type);
  try {
    return await sharp(input, {
      limitInputPixels: 20_000_000,
      failOn: "warning",
      animated: false,
    })
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(
      400,
      "تعذر قراءة الصورة، استخدم صورة JPEG أو PNG سليمة",
    );
  }
}
export async function uploadProductImage(
  user: SessionUser,
  productId: string,
  file: File,
) {
  const owned = (
    await db().query(
      "SELECT x.id FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE x.id=$1 AND p.user_id=$2 AND p.status NOT IN ('suspended','rejected')",
      [productId, user.id],
    )
  ).rows[0];
  if (!owned) throw new HttpError(404, "المنتج غير موجود أو غير قابل للتعديل");
  const client = storage();
  const data = await prepareProductImage(file);
  const id = randomUUID(),
    key = "private/product-images/" + id,
    imageUrl = "/api/media/" + id;
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
  let old: { id: string; object_key: string | null } | undefined;
  try {
    await transaction(async (connection) => {
      const current = (
        await connection.query(
          "SELECT x.image_url FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE x.id=$1 AND p.user_id=$2 AND p.status NOT IN ('suspended','rejected') FOR UPDATE OF x",
          [productId, user.id],
        )
      ).rows[0];
      if (!current)
        throw new HttpError(404, "المنتج غير موجود أو غير قابل للتعديل");
      if (current.image_url?.startsWith("/api/media/"))
        old = (
          await connection.query(
            "SELECT id,object_key FROM jdatna.product_media WHERE product_id=$1 AND url=$2",
            [productId, current.image_url],
          )
        ).rows[0];
      await connection.query(
        "INSERT INTO jdatna.product_media(id,product_id,url,kind,object_key,mime,size) VALUES($1,$2,$3,'image',$4,'image/webp',$5)",
        [id, productId, imageUrl, key, data.length],
      );
      await connection.query(
        "UPDATE jdatna.products SET image_url=$2,updated_at=now() WHERE id=$1",
        [productId, imageUrl],
      );
      if (old)
        await connection.query("DELETE FROM jdatna.product_media WHERE id=$1", [
          old.id,
        ]);
    });
  } catch (error) {
    await client
      .send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      )
      .catch(() => {});
    throw error;
  }
  if (old?.object_key)
    await client
      .send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: old.object_key,
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      )
      .catch(() => {});
  return { imageUrl };
}
export async function productImage(id: string, user: SessionUser | null) {
  let media = (
    await db().query(
      "SELECT m.object_key,m.mime,p.user_id,p.status,x.visible FROM jdatna.product_media m JOIN jdatna.products x ON x.id=m.product_id JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE m.id=$1 AND m.object_key IS NOT NULL",
      [id],
    )
  ).rows[0];
  if (!media) {
    // صورة من مكتبة الأسرة.
    const { libraryMedia } = await import("./library");
    const photo = await libraryMedia(id, user);
    if (photo)
      media = {
        object_key: photo.objectKey,
        mime: photo.mime,
        status: "approved",
        visible: true,
      };
  }
  if (
    !media ||
    !(
      (media.status === "approved" && media.visible) ||
      user?.id === media.user_id ||
      user?.role === "admin"
    )
  )
    throw new HttpError(404, "الصورة غير موجودة");
  const client = storage();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: media.object_key,
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  if (!result.Body) throw new HttpError(404, "الصورة غير موجودة");
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  return {
    data: decryptDocument(
      bytes,
      Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY!, "hex"),
    ),
    mime: media.mime,
  };
}
