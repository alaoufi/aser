import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { saveCategoryFrame } from "@/server/brand";
/** هوية القسم: إطار بطاقات منتجاته. */
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await saveCategoryFrame(user, await jsonBody(request)));
}, true);
