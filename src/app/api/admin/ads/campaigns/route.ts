import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { deleteCampaign, saveCampaign } from "@/server/ads";
/** حملات الإعلانات: حفظ (POST) وحذف (DELETE ?id=؛ إعلاناتها تبقى بلا حملة). */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json(await saveCampaign(user, await jsonBody(request)));
}, true);
export const DELETE = api(async (request) => {
  const user = await requireUser(request);
  return json(
    await deleteCampaign(
      user,
      new URL(request.url).searchParams.get("id") ?? "",
    ),
  );
}, true);
