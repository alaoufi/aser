import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyInsights } from "@/server/recommendations";
/** «طلب منطقتك» للأسرة المنتجة: أرقام مجمّعة بلا بيانات أي عميل. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  return json({ insights: await familyInsights(user) });
});
