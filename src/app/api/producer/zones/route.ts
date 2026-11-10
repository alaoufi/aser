import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { ownZones, saveZones } from "@/server/zones";
export const GET = api(async (request) =>
  json({ zones: await ownZones(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("zones:" + user.id, 60, 3600);
  return json(await saveZones(user, await jsonBody(request)));
}, true);
