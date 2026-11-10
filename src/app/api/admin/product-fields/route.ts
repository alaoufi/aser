import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { getProductFields, setProductField } from "@/server/settings";
import { can } from "@/lib/permissions";
import { HttpError } from "@/server/security";
export const GET = api(async (request) => {
  const user = await requireUser(request);
  if (!can(user, "categories"))
    throw new HttpError(403, "لا تملك صلاحية إدارة الأقسام");
  return json({ fields: await getProductFields() });
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return json({ fields: await setProductField(user, await jsonBody(request)) });
}, true);
