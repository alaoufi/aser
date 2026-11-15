import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { reviewCourier } from "@/server/couriers";
type Context = { params: Promise<{ id: string }> };
export const POST = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 120, 3600);
  return json(
    await reviewCourier(
      user,
      (await context.params).id,
      await jsonBody(request),
    ),
  );
}, true);
