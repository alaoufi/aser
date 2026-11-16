import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { requestSubscription } from "@/server/subscriptions";
/** طلب اشتراك من أسرة؛ يُحوَّل العميل بعده إلى المحادثة للاتفاق. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("subscription:" + user.id, 20, 3600);
  return json(await requestSubscription(user, await jsonBody(request)));
}, true);
