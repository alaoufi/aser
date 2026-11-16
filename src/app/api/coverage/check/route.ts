import { api, json, jsonBody } from "@/server/http";
import { rateLimit } from "@/server/auth";
import { checkLocation } from "@/server/zones";
import { sourceKey } from "@/server/security-events";
// فحص عام للقراءة فقط: لا يحتاج حسابًا ولا يغيّر شيئًا، ولا يُخزَّن فيه موقع الزائر.
export const POST = api(async (request) => {
  const source = sourceKey(request);
  if (source) await rateLimit("coverage-check-ip:" + source, 300, 3600);
  await rateLimit("coverage-check-global", 5000, 3600);
  return json(await checkLocation(await jsonBody(request)));
}, true);
