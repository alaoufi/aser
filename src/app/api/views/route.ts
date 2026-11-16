import { api, json, jsonBody } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { recordView } from "@/server/views";
/** تسجيل مشاهدة صفحة منتج أو أسرة، ويرد العدد إن كان ظاهرًا لهذا الزائر. */
export const POST = api(async (request) => {
  const user = await sessionUser(request);
  return json(await recordView(request, user, await jsonBody(request)));
}, true);
