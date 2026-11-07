import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { submitReport } from "@/server/reports";
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("report:" + user.id, 5, 3600);
  return json(await submitReport(user, await jsonBody(request)), 201);
}, true);
