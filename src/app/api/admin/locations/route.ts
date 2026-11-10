import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { adminLocations, createLocation } from "@/server/admin";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  return json(await adminLocations(user));
});
export const POST = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await createLocation(user, await jsonBody(request)));
}, true);
