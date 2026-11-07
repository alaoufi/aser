import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { ownProfile, saveProfile } from "@/server/management";
import { getCategories, getCities } from "@/server/catalog";
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const [profile, categories, cities] = await Promise.all([
    ownProfile(user),
    getCategories(),
    getCities(),
  ]);
  return json({ profile, categories, cities });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("profile:" + user.id, 20, 3600);
  return json(await saveProfile(user, await jsonBody(request)));
}, true);
