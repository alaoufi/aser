import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { ownOffers, saveOffer } from "@/server/offers";
export const GET = api(async (request) =>
  json({
    offers: await ownOffers(await requireUser(request, ["producer", "admin"])),
  }),
);
export const POST = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("offers:" + user.id, 60, 3600);
  return json(await saveOffer(user, await jsonBody(request), false));
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("offers:" + user.id, 60, 3600);
  return json(await saveOffer(user, await jsonBody(request), true));
}, true);
