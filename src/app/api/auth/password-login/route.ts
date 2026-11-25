import { api, jsonBody } from "@/server/http";
import { passwordLogin, roleDestination } from "@/server/credentials";
import { personal, rateLimit, sessionCookie } from "@/server/auth";
import { HttpError } from "@/server/security";
import {
  identifierHint,
  recordSecurityEvent,
  sourceKey,
} from "@/server/security-events";
export const POST = api(async (request) => {
  // حد لكل عنوان زائر، فلا يستنفد مهاجم واحد الحد العام فيُقفل الدخول على الجميع.
  const source = sourceKey(request);
  if (source) await rateLimit("password-login-ip:" + source, 30, 900);
  const body = (await jsonBody(request)) as { identifier?: unknown };
  const identifier =
    typeof body?.identifier === "string" ? body.identifier.trim() : "";
  let result: Awaited<ReturnType<typeof passwordLogin>>;
  try {
    result = await passwordLogin(body, source);
  } catch (error) {
    if (error instanceof HttpError) {
      const e = error as HttpError & { userId?: string; justLocked?: boolean };
      const hint = identifierHint(identifier);
      if (e.status === 401 || e.status === 403)
        await recordSecurityEvent("login.failed", {
          request,
          userId: e.userId ?? null,
          subject: identifier.toLowerCase() || null,
          detail: `${e.status === 403 ? "حساب موقوف" : "كلمة مرور خاطئة"} · ${hint}`,
        });
      else if (e.status === 423)
        // قفل الحساب عند المحاولة الخامسة، أو محاولة دخول لحساب مقفل.
        await recordSecurityEvent(
          e.justLocked ? "login.locked" : "login.while_locked",
          {
            request,
            userId: e.userId ?? null,
            subject: identifier.toLowerCase() || null,
            detail: hint,
          },
        );
    }
    throw error;
  }
  if (result.otp)
    // حساب الإدارة: الخطوة الثانية برمز الجوال، دون جلسة بعد.
    return Response.json(
      { otpRequired: true, challengeId: result.otp.challengeId },
      { headers: { "Cache-Control": "no-store" } },
    );
  // دخول حساب إدارة أو مشرف يُسجَّل ليراه المدير.
  if (result.user?.role === "admin" || result.user?.permissions?.length)
    await recordSecurityEvent("login.admin", {
      request,
      userId: result.user.id,
    });
  // الدخول للحساب الشخصي دائمًا؛ «لوحة الإدارة» تُفتح منه بجلسة مستقلة.
  const user = personal(result.user!);
  return Response.json(
    { user, next: roleDestination(user.role) },
    {
      headers: {
        "Set-Cookie": sessionCookie(result.token!),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
