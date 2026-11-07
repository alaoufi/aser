import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { ownProducts, saveProduct } from "@/server/management";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  return json({ products: await ownProducts(user) });
});
export const POST = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 60, 3600);
  return json(await saveProduct(user, await jsonBody(request), false));
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 60, 3600);
  return json(await saveProduct(user, await jsonBody(request), true));
}, true);
