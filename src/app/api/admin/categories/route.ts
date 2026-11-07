import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { adminCategories, saveCategory } from "@/server/admin";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  return json({ categories: await adminCategories(user) });
});
export const POST = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await saveCategory(user, await jsonBody(request), false));
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await saveCategory(user, await jsonBody(request), true));
}, true);
