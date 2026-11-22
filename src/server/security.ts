import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { toAsciiDigits } from "../lib/digits";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** بيانات إضافية للواجهة، مثل confirm: طلب تأكيد قبل إجراء له أثر. */
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
/**
 * رقم الجوال بأي صيغة يُلصق بها: بمسافات أو شرطات أو أقواس، أو بعلامات الاتجاه الخفية
 * التي تضيفها جهات الاتصال، أو 966 بلا «+»، أو 00966، أو 05… أو 5…، وبالأرقام العربية.
 * ما فيه حروف ليس رقم جوال (قد يكون اسم مستخدم).
 */
export function normalizePhone(value: string) {
  const ascii = toAsciiDigits(value);
  if (/\p{L}/u.test(ascii))
    throw new HttpError(400, "رقم الجوال السعودي غير صحيح");
  const digits = ascii.replace(/[^\d+]/g, "");
  const phone = digits
    .replace(/^\+?00966/, "+966")
    .replace(/^\+?966/, "+966")
    .replace(/^\+9660(?=5\d{8}$)/, "+966")
    .replace(/^0(?=5\d{8}$)/, "+966")
    .replace(/^(?=5\d{8}$)/, "+966");
  if (!/^\+9665\d{8}$/.test(phone))
    throw new HttpError(400, "رقم الجوال السعودي غير صحيح");
  return phone;
}
/**
 * عناوين الموقع الرسمية: jdtna.sa (الأساسي من 2026-11-22) وjdatna.com (يبقى يخدم الموقع نفسه، فالتطبيقات
 * المنشورة مربوطة به). www.jdtna.sa تحوّله البوابة إلى jdtna.sa، ويُقبل احتياطًا.
 */
export const SITE_ORIGINS = [
  "https://jdtna.sa",
  "https://www.jdtna.sa",
  "https://jdatna.com",
] as const;
/** هل هذا المصدر هو الموقع نفسه؟ APP_ORIGIN (أو عنوان الطلب في التطوير) وعناوين الموقع الرسمية فقط. */
export function sameSite(origin: string | null | undefined, request: Request) {
  if (!origin) return false;
  const own = process.env.APP_ORIGIN || new URL(request.url).origin;
  return origin === own || (SITE_ORIGINS as readonly string[]).includes(origin);
}
export function assertOrigin(request: Request) {
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new HttpError(503, "إعداد أمان الموقع غير مكتمل");
  if (!sameSite(request.headers.get("origin"), request))
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
