import { api, json, jsonBody } from "@/server/http";
import { rateLimit } from "@/server/auth";
import { unsubscribeByToken } from "@/server/family-alerts";
import { clientIp } from "@/server/security-events";
/** الإلغاء من رابط التنبيه بلا دخول: الرمز خاص بمتابعة أسرة واحدة. */
export const POST = api(async (request) => {
  await rateLimit("alerts-unsubscribe:" + (clientIp(request) ?? "-"), 60, 3600);
  return json(await unsubscribeByToken(await jsonBody(request)));
}, true);
