import type { SessionUser } from "../lib/types";
import {
  adminOtpRequired,
  registrationOpen,
  smsConfigured,
  storageConfigured,
} from "./auth";
import { apnsConfigured } from "./apns";
import { databaseConfigured, db } from "./db";
import { HttpError } from "./security";

/**
 * «تكاملات API» (من «أي خدمة»): حالة الخدمات المربوطة بالموقع، مربوطة أو لا فقط.
 * لا يُرجع أي مفتاح أو قيمة أو جزءًا منها: الأسرار في /etc/jdatna على الخادم وحده.
 */
export type Integration = {
  id: string;
  label: string;
  /** ماذا تفعل في الموقع. */
  what: string;
  ok: boolean;
  /** ماذا يحدث إن لم تكن مربوطة، أو أين تُضبط. */
  note: string;
};

export async function integrations(user: SessionUser): Promise<Integration[]> {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
  let database = false;
  if (databaseConfigured())
    database = await db()
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false);
  const prod = process.env.NODE_ENV === "production";
  const env = (k: string) => Boolean(process.env[k]?.trim());
  return [
    {
      id: "database",
      label: "قاعدة البيانات",
      what: "كل بيانات الموقع: الأعضاء والأسر والمنتجات والطلبات.",
      ok: database,
      note: "بدونها لا يعمل الموقع.",
    },
    {
      id: "sms",
      label: "الرسائل النصية (SMS)",
      what: "رموز التحقق عند التسجيل ونسيان كلمة المرور.",
      ok: smsConfigured(),
      note: "بدونها يتوقف التسجيل الجديد واستعادة كلمة المرور.",
    },
    {
      id: "registration",
      label: "التسجيل الجديد",
      what: "فتح التسجيل للأعضاء والأسر الجدد.",
      ok: registrationOpen(),
      note: "يحتاج قاعدة البيانات والرسائل النصية والتخزين الخاص معًا.",
    },
    {
      id: "private-storage",
      label: "التخزين الخاص المشفّر",
      what: "مستندات الأسر والمندوبين، مشفّرة.",
      ok: storageConfigured(),
      note: "بدونه لا تُرفع مستندات التسجيل.",
    },
    {
      id: "r2",
      label: "التخزين الخارجي للنسخ (Cloudflare R2)",
      what: "رفع النسخ الاحتياطية خارج الخادم، وتحميلها من التقرير.",
      ok:
        Boolean(process.env.R2_ENDPOINT?.startsWith("https://")) &&
        env("R2_BUCKET") &&
        env("R2_ACCESS_KEY_ID") &&
        env("R2_SECRET_ACCESS_KEY"),
      note: "بدونه تبقى النسخ على الخادم وحده.",
    },
    {
      id: "apns",
      label: "إشعارات تطبيق الآيفون (Apple)",
      what: "إشعار الطلبات والرسائل على أجهزة الآيفون.",
      ok: apnsConfigured(),
      note: "بدونها لا تصل الإشعارات لتطبيق الآيفون.",
    },
    {
      id: "web-push",
      label: "إشعارات المتصفح والأندرويد",
      what: "إشعار الطلبات والرسائل في المتصفح وتطبيق الأندرويد.",
      ok: database,
      note: "مفاتيحها تُولَّد تلقائيًا وتُحفظ في قاعدة البيانات.",
    },
    {
      id: "geoip",
      label: "الكشف الجغرافي",
      what: "معرفة منطقة الزائر تقريبًا لعرض أسر منطقته أولًا.",
      ok:
        env("GEOIP_MMDB_GZ") || (prod && process.env.GEOIP_DISABLED !== "true"),
      note: "بدونه يختار الزائر منطقته بنفسه.",
    },
    {
      id: "indexnow",
      label: "إبلاغ محركات البحث (IndexNow)",
      what: "تبليغ Bing وغيره فور نشر منتج أو اعتماد أسرة.",
      ok: prod && process.env.INDEXNOW_DISABLED !== "true",
      note: "بدونه تُفهرس الصفحات أبطأ.",
    },
    {
      id: "search-verification",
      label: "توثيق Google وBing",
      what: "إثبات ملكية الموقع في أدوات مشرفي المواقع.",
      ok: env("GOOGLE_SITE_VERIFICATION") || env("BING_SITE_VERIFICATION"),
      note: "يُضبط مرة واحدة على الخادم.",
    },
    {
      id: "admin-otp",
      label: "رمز الجوال لدخول الإدارة",
      what: "خطوة ثانية برمز الجوال لحسابات الإدارة.",
      ok: adminOtpRequired(),
      note: "اختيارية، ومطفأة افتراضيًا (قرار المالك).",
    },
  ];
}
