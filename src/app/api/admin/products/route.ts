import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { adminProducts, moderateProduct } from "@/server/admin";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  return json({ products: await adminProducts(user) });
});
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await moderateProduct(user, await jsonBody(request)));
}, true);
