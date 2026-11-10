import { z } from "zod";
export const documentType = z.enum([
  "commercial_registration",
  "freelance",
  "producer_certificate",
  "national_id",
  "other_document",
  "exception",
]);
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const safeHttps = z
  .string()
  .url()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "استخدم رابط HTTPS صحيحًا دون بيانات دخول");
const socialHosts: Record<string, string[]> = {
  instagram: ["instagram.com", "www.instagram.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"],
  snapchat: ["snapchat.com", "www.snapchat.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  telegram: ["t.me", "telegram.me"],
};
const socialSchema = z
  .object({
    platform: z.enum([
      "instagram",
      "tiktok",
      "snapchat",
      "x",
      "telegram",
      "website",
    ]),
    url: safeHttps,
  })
  .refine((v) => {
    try {
      return (
        v.platform === "website" ||
        socialHosts[v.platform]?.includes(new URL(v.url).hostname)
      );
    } catch {
      return false;
    }
  }, "الرابط لا يطابق منصة التواصل المختارة");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const hoursSchema = z
  .object({ day: z.number().int().min(0).max(6), opens: time, closes: time })
  .refine((v) => v.opens < v.closes, "وقت الإغلاق يجب أن يلي وقت الفتح");
const nationalIdSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value) =>
    value.replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)),
    ),
  )
  .pipe(z.string().regex(/^\d{10}$/, "رقم الهوية عشرة أرقام فقط"));
export function normalizeNationalId(value: string) {
  return nationalIdSchema.parse(value);
}
export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    tradeName: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).optional(),
    cityId: z.string().min(1).max(50),
    neighborhood: optionalText(120),
    phone: z.string().max(25),
    whatsapp: optionalText(25),
    delivery: z.boolean().optional(),
    pickup: z.boolean().optional(),
    nationalId: nationalIdSchema.optional(),
    workLocation: z
      .string()
      .trim()
      .min(5, "أدخل مكان مزاولة العمل بالتفصيل")
      .max(2000)
      .optional(),
    documentType,
    documentId: z.uuid().nullable().optional(),
    exceptionReason: optionalText(2000),
    documentNumber: optionalText(100),
    documentExpiresAt: z.iso.date().nullable().optional(),
    categoryIds: z.array(z.string().min(1).max(30)).min(1).max(100).optional(),
    website: safeHttps.nullable().optional(),
    socialLinks: z
      .array(socialSchema)
      .max(6)
      .refine(
        (v) => new Set(v.map((x) => x.platform)).size === v.length,
        "تكرار منصة التواصل",
      )
      .optional(),
    businessHours: z
      .array(hoursSchema)
      .max(7)
      .refine(
        (v) => new Set(v.map((x) => x.day)).size === v.length,
        "تكرار يوم العمل",
      )
      .optional(),
    deliveryAreas: z
      .array(
        z.object({
          cityId: z.string().min(1).max(50),
          fee: z.number().min(0).max(10000).nullable(),
        }),
      )
      .max(100)
      .refine(
        (v) => new Set(v.map((x) => x.cityId)).size === v.length,
        "تكرار مدينة التوصيل",
      )
      .optional(),
  })
  .refine(
    (x) =>
      x.documentType === "exception"
        ? Boolean(x.exceptionReason && x.exceptionReason.length >= 10)
        : Boolean(x.documentId),
    {
      message:
        "أرفق مستند الأهلية، أو اشرح طلب الاستثناء في عشرة أحرف على الأقل",
    },
  )
  .refine((x) => x.delivery !== false || x.pickup !== false, {
    message: "حدد وسيلة استلام واحدة على الأقل",
  });
export const productSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(5000),
  price: z.number().min(0).max(1000000).nullable(),
  unit: z.string().trim().min(1).max(60),
  status: z.enum(["available", "unavailable", "preorder"]),
  categoryIds: z.array(z.string().min(1).max(30)).min(1).max(100),
  allergens: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  ingredients: optionalText(2000),
  storage: optionalText(1000),
  shelfLife: optionalText(250),
  preparationTime: optionalText(250),
  story: optionalText(2000),
  /** صورة المنتج من مكتبة صور الأسرة. */
  libraryPhotoId: z.uuid().optional(),
});
export const reviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "suspended"]),
    reason: z.string().trim().min(5).max(2000),
    eligibilityConfirmed: z.boolean().optional(),
    exceptionApproved: z.boolean().optional(),
  })
  .refine((x) => x.decision !== "approved" || x.eligibilityConfirmed === true, {
    message: "يجب تأكيد الأهلية النظامية للنشاط قبل الاعتماد",
  });
