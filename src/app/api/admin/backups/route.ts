import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { backupReport } from "@/server/backups";
/** التقارير ← «النسخ الاحتياطية»: لمدير المنصة فقط. */
export const GET = api(async (request) =>
  json(await backupReport(await requireUser(request))),
);
