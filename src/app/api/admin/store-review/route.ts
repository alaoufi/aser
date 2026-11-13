import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { reviewStatus, setupReview } from "@/server/store-review";
export const GET = api(async (request) => {
  const user = await requireUser(request);
  return json(await reviewStatus(user));
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await setupReview(user, await jsonBody(request)));
}, true);
