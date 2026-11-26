import { REGION_COOKIE } from "@/lib/region-cookie";
import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { listOffers } from "@/server/offers";
import { memberScope, parseMine } from "@/server/member-scope";
import { getSiteTexts } from "@/server/settings";
import { clientIp, mask } from "@/server/security-events";
import { BOT } from "@/server/views";
import { safeDecode } from "@/lib/digits";
export const GET = api(async (request) => {
  const url = new URL(request.url);
  const user = await sessionUser(request);
  // فلاتر العضو (?mine=similar,area): منطقة العميل المحفوظة في الجهاز من الكوكي نفسه.
  const saved =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${REGION_COOKIE}=`))
      ?.slice(REGION_COOKIE.length + 1) ?? "";
  const scope = await memberScope(
    user,
    parseMine(url.searchParams.get("mine") ?? ""),
    safeDecode(saved).slice(0, 50),
    await getSiteTexts(),
  );
  // الزائر المموَّه لعدّ المشاهدات (كما في src/server/views.ts)؛ الزواحف لا تُعدّ.
  const agent = request.headers.get("user-agent") ?? "";
  const viewer =
    agent && !BOT.test(agent)
      ? mask(
          user ? `user:${user.id}` : `anon:${clientIp(request) ?? ""}:${agent}`,
        )
      : null;
  return json({
    offers: await listOffers(
      user,
      url.searchParams.get("region") ?? "",
      scope.filters,
      viewer,
    ),
  });
});
