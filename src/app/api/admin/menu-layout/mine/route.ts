import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getMenuOrder, saveMenuOrder } from "@/server/menu-layout";
/** ترتيب القائمة الجانبية الشخصي لكل مدير (السحب والإفلات): {groups, items} أو {reset: true}. */
export const GET = api(async (request) =>
  json({ order: await getMenuOrder(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await saveMenuOrder(user, await jsonBody(request)));
}, true);
