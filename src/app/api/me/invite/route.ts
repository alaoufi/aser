import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { myInvite } from "@/server/referrals";
/** رابط دعوة العضو ورصيده (عدد من سجلوا عن طريقه). */
export const GET = api(async (request) =>
  json(await myInvite(await requireUser(request))),
);
