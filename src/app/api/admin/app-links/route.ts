import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getAppLinks, setAppLinks } from "@/server/settings";
import { can } from "@/lib/permissions";
import { HttpError } from "@/server/security";
export const GET = api(async (request) => {
  const user = await requireUser(request);
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  return json({ links: await getAppLinks() });
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json({ links: await setAppLinks(user, await jsonBody(request)) });
}, true);
