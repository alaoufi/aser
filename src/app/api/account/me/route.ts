import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { updateMyAccount } from "@/server/credentials";
/** «معلوماتي»: تعديل الاسم أو تغيير كلمة المرور. */
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  return json({
    user: await updateMyAccount(user, request, await jsonBody(request)),
  });
}, true);
