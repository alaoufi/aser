import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminProducers } from "@/server/management";
export const GET = api(async (request) => {
  await requireUser(request, ["admin"]);
  return json({ producers: await adminProducers() });
});
