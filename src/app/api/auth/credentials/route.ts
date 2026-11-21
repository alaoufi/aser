import { api, jsonBody } from "@/server/http";
import { roleDestination, setCredentials } from "@/server/credentials";
import { personal, sessionCookie } from "@/server/auth";
export const POST = api(async (request) => {
  const result = await setCredentials(request, await jsonBody(request));
  const { token } = result;
  // الحساب الشخصي دائمًا؛ «لوحة الإدارة» تُفتح منه بجلسة مستقلة.
  const user = personal(result.user);
  const next =
    user.role === result.user.role ? result.next : roleDestination(user.role);
  return Response.json(
    { user, next },
    {
      headers: {
        "Set-Cookie": sessionCookie(token),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
