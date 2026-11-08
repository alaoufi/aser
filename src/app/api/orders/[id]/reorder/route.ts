import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { reorderDraft } from "@/server/orders";
export const GET = api(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser(request);
    return json(await reorderDraft(user, (await context.params).id));
  },
);
