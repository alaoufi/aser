import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { decideSubscription } from "@/server/subscriptions";

/** حد للتعديل لكل حساب: يمنع إغراق الخادم بالطلبات المتكررة. */
async function limited(request: Request) {
  const user = await requireUser(request);
  await rateLimit("subscription-decide:" + user.id, 60, 3600);
  return user;
}
/** الأسرة تؤكد الاتفاق على الاشتراك أو تعتذر عنه. */
export const POST = api(
  async (request) =>
    json(
      await decideSubscription(await limited(request), await jsonBody(request)),
    ),
  true,
);
