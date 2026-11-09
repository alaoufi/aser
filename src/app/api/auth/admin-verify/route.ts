import { z } from "zod";
import { api, jsonBody } from "@/server/http";
import {
  ADMIN_SESSION_SECONDS,
  sessionCookie,
  verifyAdminLogin,
} from "@/server/auth";
import { otpCodePattern } from "@/server/otp";
import { HttpError } from "@/server/security";
export const POST = api(async (request) => {
  const body = z
    .object({ challengeId: z.uuid(), code: z.string().regex(otpCodePattern) })
    .strict()
    .parse(await jsonBody(request));
  const result = await verifyAdminLogin(body.challengeId, body.code);
  if (!result)
    throw new HttpError(400, "رمز الدخول غير صحيح أو منتهي الصلاحية");
  return Response.json(
    { user: result.user, next: "/admin" },
    {
      headers: {
        "Set-Cookie": sessionCookie(result.token, ADMIN_SESSION_SECONDS),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
