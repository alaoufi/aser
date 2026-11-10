import { api, jsonBody } from "@/server/http";
import { rateLimit, requireUser, sessionCookie } from "@/server/auth";
import { deleteAccount } from "@/server/account";
/** حذف الحساب نهائيًا من داخل التطبيق، وإنهاء الجلسة. */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("account-delete:" + user.id, 5, 3600);
  const result = await deleteAccount(user, await jsonBody(request));
  return Response.json(result, {
    headers: {
      "Set-Cookie": sessionCookie("", 0),
      "Cache-Control": "no-store",
    },
  });
}, true);
