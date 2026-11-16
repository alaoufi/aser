import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { decideSubscription } from "@/server/subscriptions";
/** الأسرة تؤكد الاتفاق على الاشتراك أو تعتذر عنه. */
export const POST = api(
  async (request) =>
    json(
      await decideSubscription(
        await requireUser(request),
        await jsonBody(request),
      ),
    ),
  true,
);
