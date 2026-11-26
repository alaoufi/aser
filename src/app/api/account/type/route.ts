import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { changeMyAccountType } from "@/server/account-type";
/** «معلوماتي»: صاحب الحساب يحوّله إلى عميل أو أسرة منتجة (قرار المالك 2026-11-26). */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("account-type:" + user.id, 20, 3600);
  const body = (await jsonBody(request)) as { type?: unknown };
  return json(await changeMyAccountType(user, body?.type));
}, true);
