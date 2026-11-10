import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { manageProduct, ownProducts, saveProduct } from "@/server/management";
import { getProductFields } from "@/server/settings";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  const [products, fields] = await Promise.all([
    ownProducts(user),
    getProductFields(),
  ]);
  return json({ products, fields });
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
/** إخفاء المنتج أو إظهاره أو حذفه (أرشفة). */
export const PUT = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 120, 3600);
  return json(await manageProduct(user, await jsonBody(request)));
}, true);
