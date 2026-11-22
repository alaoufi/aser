import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getInterests, saveInterests } from "@/server/member-interests";
/** اهتمامات العضو (أقسام الأكلات التي يحبها) لـ«مشابه لطلباتي». */
export const GET = api(async (request) =>
  json({ categories: await getInterests(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("member-interests:" + user.id, 30, 3600);
  return json(await saveInterests(user, await jsonBody(request)));
}, true);
