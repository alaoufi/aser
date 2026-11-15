import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { manageProduct, ownProducts, saveProduct } from "@/server/management";
import { getProductFields, getSiteTexts } from "@/server/settings";
import { productStatusLabels } from "@/lib/site-texts";
import { pingIndexNow } from "@/server/indexnow";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  const [products, fields, texts] = await Promise.all([
    ownProducts(user),
    getProductFields(),
    getSiteTexts().catch(() => null),
  ]);
  return json({ products, fields, statusLabels: productStatusLabels(texts) });
});
export const POST = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 60, 3600);
  const saved = await saveProduct(user, await jsonBody(request), false);
  pingIndexNow([`/products/${saved.id}`, "/browse"]);
  return json(saved);
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 60, 3600);
  const saved = await saveProduct(user, await jsonBody(request), true);
  pingIndexNow([`/products/${saved.id}`]);
  return json(saved);
}, true);
/** إخفاء المنتج أو إظهاره أو حذفه (أرشفة). */
export const PUT = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("products:" + user.id, 120, 3600);
  return json(await manageProduct(user, await jsonBody(request)));
}, true);
