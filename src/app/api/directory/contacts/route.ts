import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { importContacts } from "@/server/directory";
/** إضافة جهات اختارها العضو من جهات جواله (حتى 50 في المرة). */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("directory-contacts:" + user.id, 20, 3600);
  return json(await importContacts(user, await jsonBody(request)));
}, true);
