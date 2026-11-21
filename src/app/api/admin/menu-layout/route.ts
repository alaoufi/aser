import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getMenuLayout, saveMenuLayout } from "@/server/menu-layout";
/** «ترتيب القوائم»: يقرؤه كل أعضاء الإدارة (لقائمتهم)، ويحفظه المدير الكامل وحده. */
export const GET = api(async (request) =>
  json({ layout: await getMenuLayout(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await saveMenuLayout(user, await jsonBody(request)));
}, true);
