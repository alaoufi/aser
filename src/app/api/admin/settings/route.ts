import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getSiteTemplate, setSiteTemplate } from "@/server/settings";
export const GET = api(async (request) => {
  await requireUser(request, ["admin", "staff"]);
  return json({ template: await getSiteTemplate() });
});
export const PUT = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await setSiteTemplate(user, await jsonBody(request)));
}, true);
