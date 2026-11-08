import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { getAccessibleOffer } from "@/server/offers";
export const GET = api(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    return json({
      offer: await getAccessibleOffer(
        await sessionUser(request),
        id,
        new URL(request.url).searchParams.get("productId") ?? "",
      ),
    });
  },
);
