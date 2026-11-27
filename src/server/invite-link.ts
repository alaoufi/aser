import { NextResponse } from "next/server";
import {
  REF_COOKIE,
  invitePattern,
  recordInviteClick,
  validInvite,
} from "./referrals";
import { sourceKey } from "./security-events";

/**
 * رابط الدعوة (jdtna.sa/r/رقم) ورابط مشاركة التطبيق برقم العضو (jdtna.sa/app/رقم) سواء
 * (قرار المالك 2026-11-27): يحفظ الرقم في الجهاز 30 يومًا، ويسجّل فتح الرابط ببصمة الشبكة
 * (لتطبيق الآيفون)، ثم يفتح صفحة الدعوة القصيرة التي تحوّل حسب الجوال.
 */
export async function openInviteLink(request: Request, raw: string) {
  const code = raw.trim();
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
