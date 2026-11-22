import { NextResponse } from "next/server";
import { REF_COOKIE, invitePattern, validInvite } from "@/server/referrals";
/**
 * رابط الدعوة jdtna.sa/r/رقم العضو: يحفظ الرقم في الجهاز 30 يومًا ويفتح صفحة التسجيل.
 * يُحسب لصاحبه حين يؤكد الزائر جواله ويسجل حسابًا جديدًا.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const code = (await context.params).code.trim();
  const ok =
    invitePattern.test(code) && (await validInvite(code).catch(() => false));
  // تحويل نسبي: خلف البوابة عنوان الطلب داخلي (0.0.0.0:3000)، فيبقى الزائر على النطاق الذي فتحه.
  const res = new NextResponse(null, {
    status: 302,
    headers: { Location: ok ? "/login?signup=1" : "/" },
  });
  if (ok)
    res.cookies.set(REF_COOKIE, code, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  return res;
}
