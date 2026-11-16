import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { ownSubscriptions, saveSubscriptionPlan } from "@/server/subscriptions";
/** إعدادات اشتراكات الأسرة وطلباتها الواردة. */
export const GET = api(async (request) =>
  json(await ownSubscriptions(await requireUser(request))),
);
export const PUT = api(
  async (request) =>
    json(
      await saveSubscriptionPlan(
        await requireUser(request),
        await jsonBody(request),
      ),
    ),
  true,
);
