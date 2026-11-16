import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { customerChooseCourier } from "@/server/couriers";
/** العميل يختار من «تجمع المندوبين» مندوبًا لتوصيل طلبه. */
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("customer-courier:" + user.id, 30, 3600);
  return json(await customerChooseCourier(user, await jsonBody(request)));
}, true);
