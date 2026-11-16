import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { viewContract } from "@/server/subscriptions";
/** عقد الاشتراك للطرفين والإدارة. */
export const GET = api(async (request, context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  return json({ contract: await viewContract(user, id) });
});
