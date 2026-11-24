import { api, json, jsonBody } from "@/server/http";
import { requireUser, sessionUser, rateLimit } from "@/server/auth";
import { sourceKey } from "@/server/security-events";
import { submitOrder, memberOrders } from "@/server/orders";
export const GET = api(async (request) =>
  json({ orders: await memberOrders(await requireUser(request)) }),
);
export const POST = api(async (request) => {
  const user = await sessionUser(request);
  // الحد لكل عنوان زائر أولًا، فلا يوقف مصدر واحد الطلب على الجميع؛ والعام قاطع طوارئ فقط.
  const source = sourceKey(request);
  if (source) await rateLimit("orders-ip:" + source, 40, 3600);
  await rateLimit("orders-global", 3000, 3600);
  const input = await jsonBody(request);
  if (user) await rateLimit("orders-user:" + user.id, 20, 3600);
  return json(await submitOrder(user, input), 201);
}, true);
