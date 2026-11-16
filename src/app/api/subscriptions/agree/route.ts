import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { customerAgree } from "@/server/subscriptions";
/** العميل: «تم الاتفاق مع الأسرة». */
export const POST = api(
  async (request) =>
    json(
      await customerAgree(await requireUser(request), await jsonBody(request)),
    ),
  true,
);
