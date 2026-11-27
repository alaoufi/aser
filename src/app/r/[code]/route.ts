import { openInviteLink } from "@/server/invite-link";
/**
 * رابط الدعوة jdtna.sa/r/رقم العضو: يحفظ الرقم ويفتح صفحة الدعوة القصيرة التي تحوّل حسب الجوال.
 * يُحسب لصاحبه حين يؤكد الزائر جواله ويسجل حسابًا جديدًا.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return openInviteLink(request, (await context.params).code);
}
