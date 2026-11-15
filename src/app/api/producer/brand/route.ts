import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { ownBrand, saveBrand } from "@/server/brand";
/** هوية الأسرة: لون يميّز بطاقتها وبطاقات منتجاتها. */
export const GET = api(async (request) =>
  json(await ownBrand(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("brand:" + user.id, 60, 3600);
  return json(await saveBrand(user, await jsonBody(request)));
}, true);
