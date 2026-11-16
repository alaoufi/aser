import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { addMenuItem, removeMenuItem } from "@/server/subscriptions";
/** قائمة أطباق الاشتراك: إضافة طبق لوجبة، أو حذفه. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("sub-menu:" + user.id, 200, 3600);
  return json(await addMenuItem(user, await jsonBody(request)));
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("sub-menu:" + user.id, 200, 3600);
  return json(await removeMenuItem(user, await jsonBody(request)));
}, true);
