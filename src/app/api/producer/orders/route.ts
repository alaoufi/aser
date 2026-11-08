import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { producerOrders, updateOrder } from "@/server/orders";
export const GET = api(async (request) =>
  json({
    orders: await producerOrders(
      await requireUser(request, ["producer", "admin"]),
    ),
  }),
);
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("order-status:" + user.id, 100, 3600);
  return json(await updateOrder(user, await jsonBody(request)));
}, true);
