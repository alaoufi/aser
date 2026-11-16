import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { customerAgree } from "@/server/subscriptions";

/** حد للتعديل لكل حساب: يمنع إغراق الخادم بالطلبات المتكررة. */
async function limited(request: Request) {
  const user = await requireUser(request);
  await rateLimit("subscription-agree:" + user.id, 30, 3600);
  return user;
}
/** العميل: «تم الاتفاق مع الأسرة». */
export const POST = api(
  async (request) =>
    json(await customerAgree(await limited(request), await jsonBody(request))),
  true,
);
