import { api, json, jsonBody } from "@/server/http";
import { rateLimit } from "@/server/auth";
import { checkLocation } from "@/server/zones";
// فحص عام للقراءة فقط: لا يحتاج حسابًا ولا يغيّر شيئًا، ولا يُخزَّن فيه موقع الزائر.
export const POST = api(async (request) => {
  await rateLimit("coverage-check-global", 5000, 3600);
  return json(await checkLocation(await jsonBody(request)));
});
