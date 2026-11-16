import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  getCoverageTree,
  curateCoverage,
  requireCoverageAdmin,
} from "@/server/coverage";
/** شجرة التغطية للإدارة: لصلاحية المواقع فقط. */
export const GET = api(async (request) => {
  requireCoverageAdmin(await requireUser(request));
  return json({ nodes: await getCoverageTree() });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("coverage-admin:" + user.id, 60, 3600);
  return json(await curateCoverage(user, await jsonBody(request)), 201);
}, true);
