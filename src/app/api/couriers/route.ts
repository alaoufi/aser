import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listCouriers } from "@/server/couriers";
/** «المندوبين» للأسر المنتجة المعتمدة والإدارة. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const q = new URL(request.url).searchParams;
  return json({
    couriers: await listCouriers(user, {
      region: q.get("region") || undefined,
      city: q.get("city") || undefined,
    }),
  });
});
