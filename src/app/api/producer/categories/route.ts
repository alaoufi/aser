import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { saveProducerCategories } from "@/server/management";
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("producer-categories:" + user.id, 30, 3600);
  return json(await saveProducerCategories(user, await jsonBody(request)));
}, true);
