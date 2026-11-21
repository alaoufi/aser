import { api, json } from "@/server/http";
import { rateLimit, sessionUser } from "@/server/auth";
import { memberSuggestions } from "@/server/recommendations";
/** «مقترح لك»: أطباق في نطاق العضو مرتبة بذوقه (طلباته وتقييماته وما فتحه)، مع سبب كل اقتراح. */
export const GET = api(async (request) => {
  const user = await sessionUser(request);
  if (user) await rateLimit("suggest:" + user.id, 120, 3600);
  const url = new URL(request.url);
  const region = (url.searchParams.get("region") ?? "").slice(0, 40);
  return json(
    await memberSuggestions(user, /^[a-z_-]*$/.test(region) ? region : ""),
  );
});
