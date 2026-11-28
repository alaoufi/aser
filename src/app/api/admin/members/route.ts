import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { listMembers, memberTabCounts, updateMember } from "@/server/members";
export const GET = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const [members, counts] = await Promise.all([
    listMembers(user, q, params.get("tab") ?? "all"),
    memberTabCounts(user),
  ]);
  return json({ members, counts });
});
export const PATCH = api(async (request) => {
  const user = await requireUser(request, ["admin"]);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(await updateMember(user, await jsonBody(request)));
}, true);
