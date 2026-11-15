import { api, json, jsonBody } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { submitSuggestion } from "@/server/suggestions";
/** إرسال اقتراح: متاح للجميع (زائر أو عضو). */
export const POST = api(async (request) => {
  const user = await sessionUser(request);
  return json(await submitSuggestion(user, await jsonBody(request)), 201);
}, true);
