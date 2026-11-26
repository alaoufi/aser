import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { can } from "@/lib/permissions";
import { HttpError } from "@/server/security";
import { getAlertDailyLimit, setAlertDailyLimit } from "@/server/family-alerts";
/** حد «تنبيهات الأسرة» اليومي: لصلاحية «تطبيق الجوال». */
export const GET = api(async (request) => {
  if (!can(await requireUser(request), "app"))
    throw new HttpError(403, "لا تملك صلاحية الإدارة");
  return json({ dailyLimit: await getAlertDailyLimit() });
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await setAlertDailyLimit(user, await jsonBody(request)));
}, true);
