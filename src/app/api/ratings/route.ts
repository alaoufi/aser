import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit, sessionUser } from "@/server/auth";
import { rate, ratingView } from "@/server/ratings";
export const GET = api(async (request) => {
  const url = new URL(request.url);
  return json(
    await ratingView(await sessionUser(request), {
      kind: url.searchParams.get("kind"),
      target: url.searchParams.get("target"),
    }),
  );
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("rating:" + user.id, 60, 3600);
  return json(await rate(user, await jsonBody(request)));
}, true);
