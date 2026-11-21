import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { adminAds, changeAd, saveAd } from "@/server/ads";
/** الإعلانات الترويجية في الإدارة: القائمة، والحفظ (POST)، والتنشيط والإيقاف والإلغاء والحذف (PATCH). */
export const GET = api(async (request) =>
  json(await adminAds(await requireUser(request))),
);
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await saveAd(user, await jsonBody(request)));
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await changeAd(user, await jsonBody(request)));
}, true);
