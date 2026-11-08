import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { ownCoverage, saveCoverage } from "@/server/coverage";
export const GET = api(async (request) =>
  json(await ownCoverage(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("coverage:" + user.id, 30, 3600);
  return json(await saveCoverage(user, await jsonBody(request)));
}, true);
