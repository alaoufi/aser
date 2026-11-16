import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { ownFulfillment, saveFulfillment } from "@/server/management";

/** حد للتعديل لكل حساب: يمنع إغراق الخادم بالطلبات المتكررة. */
async function limited(request: Request) {
  const user = await requireUser(request);
  await rateLimit("producer-write:" + user.id, 120, 3600);
  return user;
}
export const GET = api(async (request) =>
  json(await ownFulfillment(await requireUser(request))),
);
export const PUT = api(
  async (request) =>
    json(
      await saveFulfillment(await limited(request), await jsonBody(request)),
    ),
  true,
);
