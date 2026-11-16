import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { setViewsPublic, viewsAdmin } from "@/server/views";
/** الإدارة ← «المشاهدات» (صلاحية المحتوى). */
export const GET = api(async (request) =>
  json(await viewsAdmin(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await setViewsPublic(user, await jsonBody(request)));
}, true);
