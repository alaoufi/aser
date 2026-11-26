import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  getMemberAppearance,
  saveMemberAppearance,
} from "@/server/member-appearance";
/** «المظهر» في حساب العضو: يُقرأ عند الدخول من جهاز جديد، ويُحفظ مع كل اختيار. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  return json((await getMemberAppearance(user.id)) ?? {});
});
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("member-appearance:" + user.id, 120, 3600);
  return json(await saveMemberAppearance(user, await jsonBody(request)));
}, true);
