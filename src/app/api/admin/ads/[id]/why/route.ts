import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { whyAd } from "@/server/ads";
/** «لماذا يظهر الإعلان أو لا يظهر»: ?device=&audience=&region= لفحص زائر بعينه. */
export const GET = api(async (request, context) => {
  const { id } = await context.params;
  const q = new URL(request.url).searchParams;
  const device = q.get("device");
  const audience = q.get("audience");
  return json(
    await whyAd(await requireUser(request), id, {
      device: device === "mobile" || device === "desktop" ? device : undefined,
      audience:
        audience === "guest" ||
        audience === "customer" ||
        audience === "producer"
          ? audience
          : undefined,
      region: q.has("region") ? q.get("region") || null : undefined,
    }),
  );
});
