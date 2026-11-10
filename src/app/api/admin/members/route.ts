import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { listMembers, updateMember } from "@/server/members";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return json({ members: await listMembers(user, q) });
});
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await updateMember(user, await jsonBody(request)));
}, true);
