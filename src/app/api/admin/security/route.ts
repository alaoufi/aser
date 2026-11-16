import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { securityReport } from "@/server/security-events";
/** «التقرير الأمني»: لمدير المنصة فقط. ?from=YYYY-MM-DD&to=YYYY-MM-DD&status=all|failed|blocked|success */
export const GET = api(async (request) => {
  const q = new URL(request.url).searchParams;
  return json(
    await securityReport(await requireUser(request), {
      ...(q.get("from") ? { from: q.get("from") } : {}),
      ...(q.get("to") ? { to: q.get("to") } : {}),
      ...(q.get("status") ? { status: q.get("status") } : {}),
    }),
  );
});
