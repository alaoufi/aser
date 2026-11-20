import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { registerApnsDevice, removeApnsDevice } from "@/server/apns";
/** ربط جهاز آيفون (تطبيق جدتنا) بإشعارات الحساب، أو إلغاؤه عند الخروج. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("push-apns:" + user.id, 30, 3600);
  return json(await registerApnsDevice(user, await jsonBody(request)));
}, true);
export const DELETE = api(async (request) => {
  const user = await requireUser(request);
  return json(await removeApnsDevice(user, await jsonBody(request)));
}, true);
