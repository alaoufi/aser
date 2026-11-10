import { api, json } from "@/server/http";
import {
  registrationOpen,
  renewSession,
  sessionCookie,
  sessionInfo,
  sessionToken,
} from "@/server/auth";
export const GET = api(async (request) => {
  const info = await sessionInfo(request);
  const response = json({
    user: info?.user ?? null,
    registrationOpen: registrationOpen(),
    hasPassword: info?.hasPassword ?? false,
    canSetCredentials: info?.canSetCredentials ?? false,
  });
  // الجلسة النشطة تتجدد سنة من آخر زيارة، فلا يُطلب الدخول مرة أخرى.
  if (info && (await renewSession(request)))
    response.headers.append(
      "Set-Cookie",
      sessionCookie(sessionToken(request)!),
    );
  return response;
});
