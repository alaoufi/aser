import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { storageConfigured } from "./auth";
import {
  encryptDocument,
  decryptDocument,
  validateDocument,
  HttpError,
} from "./security";
import { db } from "./db";
import { documentType } from "./validation";
export function storage() {
  if (!storageConfigured())
    throw new HttpError(503, "تخزين المستندات الخاص غير مهيأ");
  if (
    process.env.S3_ENDPOINT &&
    !process.env.S3_ENDPOINT.startsWith("https://") &&
    process.env.NODE_ENV === "production"
  )
    throw new HttpError(503, "إعداد التخزين غير آمن");
  return new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}
export async function uploadDocument(
  userId: string,
  file: File,
  typeValue: string,
) {
  const type = documentType.parse(typeValue);
  if (file.size > 10 * 1024 * 1024)
    throw new HttpError(400, "الحد الأعلى للملف 10 ميجابايت");
  const data = Buffer.from(await file.arrayBuffer());
  validateDocument(data, file.type);
  const id = randomUUID(),
    key = "private/documents/" + id;
  const client = storage();
  const encrypted = encryptDocument(
    data,
    Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY!, "hex"),
  );
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: encrypted,
      ContentType: "application/octet-stream",
      ServerSideEncryption: "AES256",
    }),
  );
  try {
    await db().query(
      "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,$3,$4,$5,$6)",
      [id, userId, type, key, file.type, file.size],
    );
  } catch (error) {
    await client
      .send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      )
      .catch(() => {});
    throw error;
  }
  return { id };
}
export async function downloadDocument(id: string, actorId: string) {
  const doc = (
    await db().query("SELECT * FROM jdatna.producer_documents WHERE id=$1", [
      id,
    ])
  ).rows[0];
  if (!doc) throw new HttpError(404, "المستند غير موجود");
  const client = storage();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: doc.object_key,
    }),
  );
  if (!result.Body) throw new HttpError(404, "المستند غير موجود");
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  const data = decryptDocument(
    bytes,
    Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY!, "hex"),
  );
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
    [randomUUID(), actorId, "document.download", id],
  );
  return { data, mime: doc.mime };
}
