import { api } from "@/server/http";
import { adminCookie, createAdminSession } from "@/server/auth";
import { recordSecurityEvent } from "@/server/security-events";

/**
 * «لوحة الإدارة» بضغطة من قائمة الحساب (مثل «أي خدمة»): من له صلاحيات إدارية ومسجّل في الموقع
 * يحصل على جلسة إدارة مستقلة 12 ساعة بملف دخول خاص. الجلسة الشخصية لا تتغير.
 */
export const POST = api(async (request) => {
  const { token, userId } = await createAdminSession(request);
  await recordSecurityEvent("login.admin", { request, userId });
  return Response.json(
    { ok: true, next: "/admin" },
    {
      headers: {
        "Set-Cookie": adminCookie(token),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
