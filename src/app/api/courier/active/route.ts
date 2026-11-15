import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { setCourierActive } from "@/server/couriers";
/** «نشط الآن»: النشط يظهر اسمه للأسر، وغير النشط يختفي. */
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("courier-active:" + user.id, 60, 3600);
  return json(await setCourierActive(user, await jsonBody(request)));
}, true);
