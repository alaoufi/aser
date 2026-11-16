import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import {
  mySubscriptions,
  setDayDish,
  setDefaultDish,
} from "@/server/subscriptions";
/** «اشتراكاتي»: الاشتراكات، والطبق الدائم لكل وجبة، وطبق يوم معيّن. */
export const GET = api(async (request) =>
  json(await mySubscriptions(await requireUser(request))),
);
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("sub-choice:" + user.id, 300, 3600);
  const body = (await jsonBody(request)) as Record<string, unknown>;
  const { kind, ...rest } = z
    .object({ kind: z.enum(["default", "day"]) })
    .passthrough()
    .parse(body);
  return json(
    kind === "default"
      ? await setDefaultDish(user, rest)
      : await setDayDish(user, rest),
  );
}, true);
