import { api, json } from "@/server/http";
import {
  adminArea,
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
  // جلسة الإدارة لا تتجدد (12 ساعة)، فالتجديد للجلسة الشخصية من صفحات الموقع فقط.
  if (info && !adminArea(request) && (await renewSession(request)))
    response.headers.append(
      "Set-Cookie",
      sessionCookie(sessionToken(request)!),
    );
  return response;
});
