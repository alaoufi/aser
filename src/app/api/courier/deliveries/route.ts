import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { courierDeliveries, markCourierDelivered } from "@/server/couriers";
/** طلبات التوصيل المسندة للمندوب: موقع الاستلام من الأسرة وموقع التوصيل للعميل. */
export const GET = api(async (request) =>
  json({ deliveries: await courierDeliveries(await requireUser(request)) }),
);
/** «تم التوصيل». */
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("courier-delivered:" + user.id, 100, 3600);
  return json(await markCourierDelivered(user, await jsonBody(request)));
}, true);
