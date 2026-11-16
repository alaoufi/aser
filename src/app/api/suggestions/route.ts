import { api, json, jsonBody } from "@/server/http";
import { rateLimit, sessionUser } from "@/server/auth";
import { sourceKey } from "@/server/security-events";
import { submitSuggestion } from "@/server/suggestions";
/** إرسال اقتراح: متاح للجميع (زائر أو عضو). */
export const POST = api(async (request) => {
  const user = await sessionUser(request);
  // الزائر بلا حساب: حد لكل عنوان، فلا يستنفد مصدر واحد الحد العام.
  const source = sourceKey(request);
  if (!user && source) await rateLimit("suggestions-ip:" + source, 5, 3600);
  return json(await submitSuggestion(user, await jsonBody(request)), 201);
}, true);
