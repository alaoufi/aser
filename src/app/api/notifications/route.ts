import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { myNotifications, readNotifications } from "@/server/notifications";
/** جرس «الإشعارات»: آخر الإشعارات وعدد غير المقروء، وتعليمها مقروءة. */
export const GET = api(async (request) =>
  json(await myNotifications(await requireUser(request))),
);
export const POST = api(
  async (request) =>
    json(
      await readNotifications(
        await requireUser(request),
        await jsonBody(request),
      ),
    ),
  true,
);
