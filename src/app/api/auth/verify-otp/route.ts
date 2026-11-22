import { toAsciiDigits } from "@/lib/digits";
import { otpCodePattern } from "@/server/otp";
import { z } from "zod";
import { api, jsonBody } from "@/server/http";
import {
  personal,
  rateLimit,
  verifyOtp,
  sessionCookie,
  otpPurposeSchema,
} from "@/server/auth";
import { recordSecurityEvent, sourceKey } from "@/server/security-events";
import { HttpError } from "@/server/security";
import { roleDestination } from "@/server/credentials";
export const POST = api(async (request) => {
  const source = sourceKey(request);
  if (source) await rateLimit("verify-ip:" + source, 40, 900);
  const body = z
    .object({
      challengeId: z.uuid(),
      // الرمز بالأرقام العربية (١٢٣٤) أو اللاتينية.
      code: z
        .string()
        .transform((v) => toAsciiDigits(v.trim()))
        .pipe(z.string().regex(otpCodePattern)),
      name: z.string().trim().min(2).max(120).optional(),
      purpose: otpPurposeSchema,
      // «ادعُ صديقًا»: رقم جوال من دعاه (اختياري).
      referrerPhone: z.string().trim().max(30).optional(),
    })
    .strict()
    .refine(
      (value) => value.purpose !== "signup" || Boolean(value.name),
      "أدخل اسم صاحب الحساب",
    )
    .parse(await jsonBody(request));
  const refCode = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("jdatna_ref="))
    ?.slice("jdatna_ref=".length);
  const result = await verifyOtp(
    body.challengeId,
    body.code,
    body.name,
    body.purpose,
    { code: refCode ?? null, phone: body.referrerPhone || null },
  );
  if (!result) {
    await recordSecurityEvent("otp.failed", { request, detail: body.purpose });
    throw new HttpError(400, "رمز التحقق غير صحيح أو منتهي الصلاحية");
  }
  const user = personal(result.user);
  return Response.json(
    {
      user,
      next: roleDestination(user.role),
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
