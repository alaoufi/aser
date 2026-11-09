import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { markOrdersSeen, producerOrderAlerts } from "@/server/orders";
export const GET = api(async (request) =>
  json(await producerOrderAlerts(await requireUser(request, ["producer"]))),
);
export const POST = api(async (request) => {
  const user = await requireUser(request, ["producer"]);
  await rateLimit("order-seen:" + user.id, 300, 3600);
  return json(await markOrdersSeen(user, await jsonBody(request)));
}, true);
