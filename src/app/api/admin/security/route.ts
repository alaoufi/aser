import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { securityOverview } from "@/server/security-events";
/** «سجل الأمان»: لمدير المنصة فقط. */
export const GET = api(async (request) =>
  json(await securityOverview(await requireUser(request))),
);
