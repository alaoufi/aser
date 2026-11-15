import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminSuggestions, manageSuggestion } from "@/server/suggestions";
/** الاقتراحات لمسؤول الإدارة فقط. */
export const GET = api(async (request) =>
  json({ suggestions: await adminSuggestions(await requireUser(request)) }),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await manageSuggestion(user, await jsonBody(request));
  return json({ suggestions: await adminSuggestions(user) });
}, true);
