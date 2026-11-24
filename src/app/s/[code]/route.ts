import { NextResponse } from "next/server";
import { resolveShare } from "@/server/share";
import { SITE_URL } from "@/lib/seo";
export const dynamic = "force-dynamic";
/** الرابط المختصر: يحوّل إلى صفحة المنتج أو الأسرة، أو «طبخات اليوم» إن لم يعد متاحًا. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const path = await resolveShare((await context.params).code).catch(
    () => null,
  );
  // 301 للرمز الصالح فقط؛ الرمز غير الموجود تحويل مؤقت كي لا يحفظه المتصفح ومحركات البحث (مراجعة 2026-11-24).
  return NextResponse.redirect(
    new URL(path ?? "/browse", SITE_URL),
    path ? 301 : 302,
  );
}
