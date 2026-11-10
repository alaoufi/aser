import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { reviewProducer } from "@/server/management";
export const POST = api(async (request, context) => {
  const user = await requireUser(request, ["admin", "staff"]);
  const { id } = await context.params;
  return json(
    await reviewProducer(user, z.uuid().parse(id), await jsonBody(request)),
  );
}, true);
