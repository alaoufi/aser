import { NextResponse } from "next/server";
import {
  REF_COOKIE,
  invitePattern,
  recordInviteClick,
  validInvite,
} from "@/server/referrals";
import { sourceKey } from "@/server/security-events";
/**
 * رابط الدعوة jdtna.sa/r/رقم العضو: يحفظ الرقم في الجهاز 30 يومًا، ويسجّل فتح الرابط ببصمة الشبكة
 * (لتطبيق الآيفون)، ثم يفتح صفحة الدعوة القصيرة التي تحوّل الصديق حسب جواله (قرار المالك 2026-11-27).
 * يُحسب لصاحبه حين يؤكد الزائر جواله ويسجل حسابًا جديدًا.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const code = (await context.params).code.trim();
  const ok =
    invitePattern.test(code) && (await validInvite(code).catch(() => false));
  if (ok) await recordInviteClick(code, sourceKey(request)).catch(() => {});
  // تحويل نسبي: خلف البوابة عنوان الطلب داخلي (0.0.0.0:3000)، فيبقى الزائر على النطاق الذي فتحه.
  const res = new NextResponse(null, {
    status: 302,
    headers: { Location: ok ? `/invite/${code}` : "/" },
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
