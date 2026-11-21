import { api, json } from "@/server/http";
import { rateLimit } from "@/server/auth";
import { trackAd } from "@/server/ads";
import { sourceKey } from "@/server/security-events";
import { HttpError } from "@/server/security";
/** مشاهدة الإعلان أو النقر عليه: بحد لكل عنوان زائر، فلا يُضخَّم العدّاد. */
export const POST = api(async (request, context) => {
  const { id, event } = await context.params;
  if (event !== "view" && event !== "click")
    throw new HttpError(404, "غير موجود");
  const source = sourceKey(request);
  if (source)
    await rateLimit(`ad-${event}:${source}`, event === "view" ? 300 : 60, 3600);
  await trackAd(id, event);
  return json({ ok: true });
}, true);
