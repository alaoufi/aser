import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { centerOptions, ownCourier, saveCourier } from "@/server/couriers";
import { getCities } from "@/server/catalog";
/** بيانات المندوب نفسه: الاسم الحقيقي ورقم الهوية وصورتها ونوع السيارة ومدينة العمل. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const [courier, cities, centers] = await Promise.all([
    ownCourier(user),
    getCities(),
    centerOptions(),
  ]);
  return json({ courier, cities, centers });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("courier-profile:" + user.id, 30, 3600);
  return json(await saveCourier(user, await jsonBody(request)));
}, true);
