import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { ownFulfillment, saveFulfillment } from "@/server/management";
export const GET = api(async (request) =>
  json(await ownFulfillment(await requireUser(request))),
);
export const PUT = api(
  async (request) =>
    json(
      await saveFulfillment(
        await requireUser(request),
        await jsonBody(request),
      ),
    ),
  true,
);
