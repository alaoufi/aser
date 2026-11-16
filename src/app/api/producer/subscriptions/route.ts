import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { ownSubscriptions, saveSubscriptionPlan } from "@/server/subscriptions";

/** حد للتعديل لكل حساب: يمنع إغراق الخادم بالطلبات المتكررة. */
async function limited(request: Request) {
  const user = await requireUser(request);
  await rateLimit("producer-write:" + user.id, 120, 3600);
  return user;
}
/** إعدادات اشتراكات الأسرة وطلباتها الواردة. */
export const GET = api(async (request) =>
  json(await ownSubscriptions(await requireUser(request))),
);
export const PUT = api(
  async (request) =>
    json(
      await saveSubscriptionPlan(
        await limited(request),
        await jsonBody(request),
      ),
    ),
  true,
);
