import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  actOnChatOrder,
  chatOrders,
  createChatOrder,
} from "@/server/chat-orders";
type Context = { params: Promise<{ id: string }> };
/** الطلب داخل المحادثة (قرار المالك 2026-11-27): الطلبات ومنتجات الأسرة للعميل. */
export const GET = api(async (request, context: Context) =>
  json(await chatOrders(await requireUser(request), (await context.params).id)),
);
/** {productId, quantity, notes}: طلب جديد من العميل. {orderId, action}: إتمام أو إلغاء. */
export const POST = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("chat-order:" + user.id, 60, 3600);
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const id = (await context.params).id;
  return json(
    body && typeof body === "object" && "action" in body
      ? await actOnChatOrder(user, id, body)
      : await createChatOrder(user, id, body),
    201,
  );
}, true);
