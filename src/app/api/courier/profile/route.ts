import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { ownCourier, saveCourier } from "@/server/couriers";
import { getCities } from "@/server/catalog";
/** بيانات المندوب نفسه: الاسم الحقيقي ورقم الهوية وصورتها ونوع السيارة ومدينة العمل. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const [courier, cities] = await Promise.all([ownCourier(user), getCities()]);
  return json({ courier, cities });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("courier-profile:" + user.id, 30, 3600);
  return json(await saveCourier(user, await jsonBody(request)));
}, true);
