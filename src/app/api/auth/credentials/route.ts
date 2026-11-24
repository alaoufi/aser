import { api, jsonBody } from "@/server/http";
import { roleDestination, setCredentials } from "@/server/credentials";
import { personal, rateLimit, sessionCookie } from "@/server/auth";
import { sourceKey } from "@/server/security-events";
export const POST = api(async (request) => {
  // حد لكل عنوان زائر، فلا يستنفد مصدر واحد الحد العام فيتوقف إكمال التسجيل على الجميع.
  const source = sourceKey(request);
  if (source) await rateLimit("credentials-ip:" + source, 30, 900);
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
