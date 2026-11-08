import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getCoverageTree, curateCoverage } from "@/server/coverage";
export const GET = api(async (request) => {
  await requireUser(request, ["admin"]);
  return json({ nodes: await getCoverageTree() });
});
export const POST = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  await rateLimit("coverage-admin:" + user.id, 60, 3600);
  return json(await curateCoverage(user, await jsonBody(request)), 201);
}, true);
