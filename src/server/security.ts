import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function normalizePhone(value: string) {
  const phone = value
    .replace(/[\s-]/g, "")
    .replace(/^00966/, "+966")
    .replace(/^0(?=5\d{8}$)/, "+966");
  if (!/^\+9665\d{8}$/.test(phone))
    throw new HttpError(400, "رقم الجوال السعودي غير صحيح");
  return phone;
}
export function assertOrigin(request: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new HttpError(503, "إعداد أمان الموقع غير مكتمل");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "مصدر الطلب غير مسموح");
}
export function validateDocument(data: Buffer, mime: string) {
  if (data.length > 10 * 1024 * 1024 || !data.length)
    throw new HttpError(400, "حجم الملف غير مسموح");
  const valid =
    (mime === "application/pdf" &&
      data.subarray(0, 5).toString() === "%PDF-") ||
    (mime === "image/jpeg" &&
      data[0] === 255 &&
      data[1] === 216 &&
      data[2] === 255) ||
    (mime === "image/png" &&
      data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  if (!valid) throw new HttpError(400, "نوع الملف أو محتواه غير مسموح");
}
export function encryptDocument(data: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
export function decryptDocument(data: Buffer, key: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}
