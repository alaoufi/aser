import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { listOffers } from "@/server/offers";
import { memberScope, parseMine } from "@/server/member-scope";
import { getSiteTexts } from "@/server/settings";
export const GET = api(async (request) => {
  const url = new URL(request.url);
  const user = await sessionUser(request);
  // فلاتر العضو (?mine=similar,area): منطقة العميل المحفوظة في الجهاز من الكوكي نفسه.
  const saved =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("jdatna_region="))
      ?.slice("jdatna_region=".length) ?? "";
  const scope = await memberScope(
    user,
    parseMine(url.searchParams.get("mine") ?? ""),
    decodeURIComponent(saved).slice(0, 50),
    await getSiteTexts(),
  );
  return json({
    offers: await listOffers(
      user,
      url.searchParams.get("region") ?? "",
      scope.filters,
    ),
  });
});
