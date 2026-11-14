import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  ownContactVisibility,
  saveContactVisibility,
} from "@/server/management";
export const GET = api(async (request) =>
  json(await ownContactVisibility(await requireUser(request))),
);
export const PUT = api(
  async (request) =>
    json(
      await saveContactVisibility(
        await requireUser(request),
        await jsonBody(request),
      ),
    ),
  true,
);
