import { api, json } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { tradeNameAvailable } from "@/server/management";
/** هل الاسم التجاري المعلن متاح؟ للتنبيه أثناء التسجيل قبل الحفظ. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("trade-name:" + user.id, 120, 3600);
  const name = new URL(request.url).searchParams.get("name") ?? "";
  return json(await tradeNameAvailable(user, name));
});
