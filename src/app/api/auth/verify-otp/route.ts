import { otpCodePattern } from "@/server/otp";
import { z } from "zod";
import { api, jsonBody } from "@/server/http";
import { verifyOtp, sessionCookie, otpPurposeSchema } from "@/server/auth";
import { HttpError } from "@/server/security";
import { roleDestination } from "@/server/credentials";
export const POST = api(async (request) => {
  const body = z
    .object({
      challengeId: z.uuid(),
      code: z.string().regex(otpCodePattern),
      name: z.string().trim().min(2).max(120).optional(),
      purpose: otpPurposeSchema,
    })
    .strict()
    .refine(
      (value) => value.purpose !== "signup" || Boolean(value.name),
      "أدخل اسم صاحب الحساب",
    )
    .parse(await jsonBody(request));
  const result = await verifyOtp(
    body.challengeId,
    body.code,
    body.name,
    body.purpose,
  );
  if (!result)
    throw new HttpError(400, "رمز التحقق غير صحيح أو منتهي الصلاحية");
  return Response.json(
    {
      user: result.user,
      next: roleDestination(result.user.role),
      canSetCredentials: true,
    },
    {
      headers: {
        "Set-Cookie": sessionCookie(result.token, 600),
        "Cache-Control": "no-store",
      },
    },
  );
}, true);
