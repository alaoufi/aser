import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminReferred, adminReferrers } from "@/server/referrals";
/** «دعوات الأصدقاء»: الأعضاء وأرصدتهم، أو ?user=… من سجل عن طريق عضو. */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const id = new URL(request.url).searchParams.get("user");
  return json(
    id
      ? await adminReferred(user, id)
      : { referrers: await adminReferrers(user) },
  );
});
