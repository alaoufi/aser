import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { subscribePush, unsubscribePush } from "@/server/push";
/** ربط جهاز المستخدم بإشعارات حسابه، أو إلغاؤه. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("push-subscribe:" + user.id, 30, 3600);
  return json(await subscribePush(user, await jsonBody(request)));
}, true);
export const DELETE = api(async (request) => {
  const user = await requireUser(request);
  return json(await unsubscribePush(user, await jsonBody(request)));
}, true);
