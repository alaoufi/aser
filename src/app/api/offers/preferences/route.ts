import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getOfferPreferences, saveOfferPreferences } from "@/server/offers";
export const GET = api(async (request) =>
  json({ groups: await getOfferPreferences(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("offer-preferences:" + user.id, 30, 3600);
  return json(await saveOfferPreferences(user, await jsonBody(request)));
}, true);
