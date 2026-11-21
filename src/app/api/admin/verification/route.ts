import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { HttpError } from "@/server/security";
import {
  getDomainVerification,
  setDomainVerification,
} from "@/server/settings";
/** رمز إثبات ملكية النطاق (المركز السعودي للأعمال): للمدير الكامل فقط. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
  return json({ code: await getDomainVerification() });
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await setDomainVerification(user, await jsonBody(request)));
}, true);
