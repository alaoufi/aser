import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getAppearanceSettings, setSiteTemplate } from "@/server/settings";
import { can } from "@/lib/permissions";
import { HttpError } from "@/server/security";
/** قالب الموقع وألوانه في الإدارة (الافتراضي والمتاح للزائر): لصلاحية «قالب الموقع». */
export const GET = api(async (request) => {
  if (!can(await requireUser(request), "template"))
    throw new HttpError(403, "لا تملك صلاحية الإدارة");
  return json(await getAppearanceSettings());
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await setSiteTemplate(user, await jsonBody(request)));
}, true);
