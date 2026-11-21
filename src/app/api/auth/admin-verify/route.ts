import { toAsciiDigits } from "@/lib/digits";
import { z } from "zod";
import { api, jsonBody } from "@/server/http";
import {
  ADMIN_SESSION_SECONDS,
  personal,
  rateLimit,
  sessionCookie,
  verifyAdminLogin,
} from "@/server/auth";
import { recordSecurityEvent, sourceKey } from "@/server/security-events";
import { otpCodePattern } from "@/server/otp";
import { HttpError } from "@/server/security";
import { roleDestination } from "@/server/credentials";
export const POST = api(async (request) => {
  const source = sourceKey(request);
  if (source) await rateLimit("verify-ip:" + source, 40, 900);
  const body = z
    .object({
      challengeId: z.uuid(),
      code: z
        .string()
        .transform((v) => toAsciiDigits(v.trim()))
        .pipe(z.string().regex(otpCodePattern)),
    })
    .strict()
    .parse(await jsonBody(request));
  const result = await verifyAdminLogin(body.challengeId, body.code);
  if (!result) {
    await recordSecurityEvent("otp.failed", { request, detail: "admin" });
    throw new HttpError(400, "رمز الدخول غير صحيح أو منتهي الصلاحية");
  }
  await recordSecurityEvent("login.admin", { request, userId: result.user.id });
  return Response.json(
    {
      user: personal(result.user),
      next: roleDestination(personal(result.user).role),
    },
    {
      headers: {
        "Set-Cookie": sessionCookie(result.token, ADMIN_SESSION_SECONDS),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
