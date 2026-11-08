import { api, json, jsonBody } from "@/server/http";
import { requireUser, sessionUser, rateLimit, hash } from "@/server/auth";
import { submitOrder, memberOrders } from "@/server/orders";
export const GET = api(async (request) =>
  json({ orders: await memberOrders(await requireUser(request)) }),
);
export const POST = api(async (request) => {
  const user = await sessionUser(request);
  await rateLimit("orders-global", 300, 3600);
  const input = await jsonBody(request);
  // Raw phone is hashed only for throttling, never for history or identity.
  const { normalizePhone } = await import("@/server/security");
  if (typeof input?.phone === "string")
    await rateLimit(
      "orders-phone:" + hash(normalizePhone(input.phone)),
      10,
      3600,
    );
  if (user) await rateLimit("orders-user:" + user.id, 20, 3600);
  return json(await submitOrder(user, input), 201);
}, true);
