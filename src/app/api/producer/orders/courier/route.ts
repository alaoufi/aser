import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { assignOrderCourier } from "@/server/couriers";
/** الأسرة تسند طلب التوصيل لمندوب متاح في تغطيتها. */
export const PUT = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("order-courier:" + user.id, 60, 3600);
  return json(await assignOrderCourier(user, await jsonBody(request)));
}, true);
