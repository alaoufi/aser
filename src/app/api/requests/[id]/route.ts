import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { closeCustomerRequest } from "@/server/customer-requests";
type Context = { params: Promise<{ id: string }> };
/** العميل يغلق طلبه (وجد أسرة، أو لم يعد يحتاجه). */
export const DELETE = api(async (request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  return json(await closeCustomerRequest(user, id));
}, true);
