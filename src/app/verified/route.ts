import { NextResponse } from "next/server";
import { sealLink } from "@/server/verified-seal";

/**
 * «متجر موثّق» يفتح بيانات شهادة جدتنا مباشرة (طلب المالك 2026-11-23).
 * ختم المنصة يعرض نافذة الرمز أولًا ثم «عرض التحقق». هذا الرابط يجلب رابط «عرض التحقق» نفسه
 * من خدمة الختم العامة (برمز مؤقت تصدره المنصة) ويحوّل إليه. وإن تعذّر: صفحة الاستعلام الرسمية.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const url = await sealLink();
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
