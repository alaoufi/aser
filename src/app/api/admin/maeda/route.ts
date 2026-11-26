import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { maedaAdmin, setMaedaHidden } from "@/server/maeda";
/** الإدارة ← «خيارات المائدة» (صلاحية قالب الموقع). */
export const GET = api(async (request) =>
  json(await maedaAdmin(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await setMaedaHidden(user, await jsonBody(request)));
}, true);
