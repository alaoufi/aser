import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { ownFamilyTable, saveFamilyTable } from "@/server/family-table";
/** مائدة الأسرة: تختارها من مكتبة الموائد، وتظهر في صفحتها وعليها منتجاتها. */
export const GET = api(async (request) =>
  json(await ownFamilyTable(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("family-table:" + user.id, 60, 3600);
  return json(await saveFamilyTable(user, await jsonBody(request)));
}, true);
