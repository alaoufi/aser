import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { liveAds } from "@/server/ads";
import { deviceOf, isPlacement, type AdAudience } from "@/lib/ads";
import { HttpError } from "@/server/security";
import { safeDecode } from "@/lib/digits";
/**
 * إعلانات مكان واحد للزائر: ?placement=home_top. الاستهداف من جهازه وحسابه الشخصي ومنطقته
 * (ملف jdatna_region الذي يختاره من «منطقة المائدة»).
 */
export const GET = api(async (request) => {
  const url = new URL(request.url);
  const placement = url.searchParams.get("placement");
  if (!isPlacement(placement)) throw new HttpError(400, "مكان غير معروف");
  const user = await sessionUser(request).catch(() => null);
  const audience: AdAudience = !user
    ? "guest"
    : user.role === "producer"
      ? "producer"
      : "customer";
  const region =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("jdatna_region="))
      ?.slice("jdatna_region=".length) ?? "";
  const ads = await liveAds(placement, {
    device: deviceOf(request.headers.get("user-agent") ?? ""),
    audience,
    region: /^[a-z0-9-]{1,40}$/.test(safeDecode(region))
      ? safeDecode(region)
      : null,
  });
  // للزائر نفسه فقط (حسب جهازه وحسابه ومنطقته)، ولا يُخزَّن.
  return json({ ads });
});
