import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { removeDirectoryEntry, updateDirectoryEntry } from "@/server/directory";
type Context = { params: Promise<{ id: string }> };
export const PATCH = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("directory:" + user.id, 120, 3600);
  const { id } = await context.params;
  return json(await updateDirectoryEntry(user, id, await jsonBody(request)));
}, true);
export const DELETE = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("directory:" + user.id, 120, 3600);
  const { id } = await context.params;
  return json(await removeDirectoryEntry(user, id));
}, true);
