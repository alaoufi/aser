import { openInviteLink } from "@/server/invite-link";
/**
 * رابط مشاركة التطبيق برقم العضو jdtna.sa/app/رقم (قرار المالك 2026-11-27): كدعوة الصديق تمامًا،
 * صفحة قصيرة ثم متجر الجوال، ويُحسب للعضو من يسجّل به.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return openInviteLink(request, (await context.params).code);
}
