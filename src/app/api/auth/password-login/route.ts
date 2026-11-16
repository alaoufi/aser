import { api, jsonBody } from "@/server/http";
import { passwordLogin } from "@/server/credentials";
import { rateLimit, sessionCookie } from "@/server/auth";
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
    result = await passwordLogin(body);
  } catch (error) {
    if (
      error instanceof HttpError &&
      (error.status === 401 || error.status === 403)
    )
      await recordSecurityEvent("login.failed", {
        request,
        subject: identifier.toLowerCase() || null,
        detail: `${error.status === 403 ? "حساب موقوف" : "كلمة مرور خاطئة"} · ${identifierHint(identifier)}`,
      });
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
  return Response.json(
    { user: result.user, next: result.next },
    {
      headers: {
        "Set-Cookie": sessionCookie(result.token!),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
