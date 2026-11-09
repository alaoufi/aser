import { api, jsonBody } from "@/server/http";
import { passwordLogin } from "@/server/credentials";
import { sessionCookie } from "@/server/auth";
export const POST = api(async (request) => {
  const result = await passwordLogin(await jsonBody(request));
  if (result.otp)
    // حساب الإدارة: الخطوة الثانية برمز الجوال، دون جلسة بعد.
    return Response.json(
      { otpRequired: true, challengeId: result.otp.challengeId },
      { headers: { "Cache-Control": "no-store" } },
    );
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
