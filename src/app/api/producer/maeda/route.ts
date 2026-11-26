import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { familyMaeda, setFamilyMaeda } from "@/server/maeda";
/** لوحة الأسرة ← «مائدتي»: مائدة الأسرة صاحبة الحساب فقط. */
export const GET = api(async (request) =>
  json(await familyMaeda(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("maeda-write:" + user.id, 60, 3600);
  return json(await setFamilyMaeda(user, await jsonBody(request)));
}, true);
