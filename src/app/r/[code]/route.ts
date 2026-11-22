import { NextResponse } from "next/server";
import { REF_COOKIE, validInviteCode } from "@/server/referrals";
/**
 * رابط الدعوة jdtna.sa/r/رمز: يحفظ الرمز في الجهاز 30 يومًا ويفتح صفحة التسجيل.
 * يُحسب لصاحبه حين يؤكد الزائر جواله ويسجل حسابًا جديدًا.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const ok = await validInviteCode(code).catch(() => false);
  const res = NextResponse.redirect(
    new URL(ok ? "/login?signup=1" : "/", request.url),
    302,
  );
  if (ok)
    res.cookies.set(REF_COOKIE, code, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  return res;
}
