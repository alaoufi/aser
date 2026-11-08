import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  ownCookingAvailability,
  saveCookingAvailability,
} from "@/server/cooking-availability";
export const GET = api(async (request) =>
  json(await ownCookingAvailability(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("cooking-day:" + user.id, 60, 3600);
  return json(await saveCookingAvailability(user, await jsonBody(request)));
}, true);
