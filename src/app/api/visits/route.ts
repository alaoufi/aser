import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { recordVisit } from "@/server/views";
/** نبضة الزائر: تسجّل زيارته اليومية ووجوده الآن، وترد أعداد الزوار إن كانت ظاهرة له. */
export const POST = api(
  async (request) =>
    json(await recordVisit(request, await sessionUser(request))),
  true,
);
