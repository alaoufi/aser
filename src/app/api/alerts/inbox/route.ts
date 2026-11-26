import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { myInbox } from "@/server/family-alerts";
/** آخر التنبيهات داخل الموقع («تنبيهاتي»)؛ فتحها يعلّمها مقروءة. */
export const GET = api(async (request) =>
  json({ alerts: await myInbox(await requireUser(request)) }),
);
