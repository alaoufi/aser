import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { adminSiteTexts, setSiteText } from "@/server/settings";
export const GET = api(async (request) =>
  json({
    texts: await adminSiteTexts(await requireUser(request, ["admin", "staff"])),
  }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request, ["admin", "staff"]);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await setSiteText(user, await jsonBody(request)));
}, true);
