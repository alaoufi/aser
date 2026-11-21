import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { activityLog } from "@/server/activity-log";
/** «سجل النشاطات»: للمدير الكامل فقط. ?group=…&q=…&before=… */
export const GET = api(async (request) => {
  const params = Object.fromEntries(
    [...new URL(request.url).searchParams].filter(([, v]) => v !== ""),
  );
  return json(await activityLog(await requireUser(request), params));
});
