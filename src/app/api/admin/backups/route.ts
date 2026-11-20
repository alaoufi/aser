import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { backupReport, requestBackup } from "@/server/backups";
/** التقارير ← «النسخ الاحتياطية»: لمدير المنصة فقط. */
export const GET = api(async (request) =>
  json(await backupReport(await requireUser(request))),
);
/** «خذ نسخة الآن»: بحد 6 طلبات في الساعة. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  if (user.role === "admin")
    await rateLimit("backup-request:" + user.id, 6, 3600);
  return json(await requestBackup(user, await jsonBody(request)), 201);
}, true);
