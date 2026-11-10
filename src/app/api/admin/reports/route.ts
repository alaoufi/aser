import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { adminReports, resolveReport } from "@/server/admin";
export const GET = api(async (request) => {
  const user = await requireUser(request);
  return json({ reports: await adminReports(user) });
});
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await resolveReport(user, await jsonBody(request)));
}, true);
