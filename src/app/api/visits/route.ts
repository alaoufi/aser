import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { recordVisit } from "@/server/views";
/**
 * نبضة الزائر: { hit: true } عند فتح الصفحة أو تحديثها تُحسب زيارة (كل مرة)، والنبضة الدورية
 * بلا hit تسجّل وجوده الآن فقط. ترد أعداد الزوار إن كانت ظاهرة له.
 */
export const POST = api(async (request) => {
  const body = (await request.json().catch(() => null)) as {
    hit?: unknown;
  } | null;
  return json(
    await recordVisit(request, await sessionUser(request), body?.hit === true),
  );
}, true);
