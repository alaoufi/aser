import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { adminSuggestions, manageSuggestion } from "@/server/suggestions";

/** حد للتعديل لكل حساب: يمنع إغراق الخادم بالطلبات المتكررة. */
async function limited(request: Request) {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  return user;
}
/** الاقتراحات لمسؤول الإدارة فقط. */
export const GET = api(async (request) =>
  json({ suggestions: await adminSuggestions(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await limited(request);
  await manageSuggestion(user, await jsonBody(request));
  return json({ suggestions: await adminSuggestions(user) });
}, true);
