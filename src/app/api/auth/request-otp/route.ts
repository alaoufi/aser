import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requestOtp, otpPurposeSchema } from "@/server/auth";
import { sourceKey } from "@/server/security-events";
export const POST = api(async (request) => {
  // حد لكل عنوان زائر: لا يرسل مصدر واحد رسائل تحقق كثيرة (تكلفة SMS وإزعاج).
  const source = sourceKey(request);
  if (source) await rateLimit("otp-ip:" + source, 10, 3600);
  const { phone, purpose } = z
    .object({ phone: z.string().max(25), purpose: otpPurposeSchema })
    .strict()
    .parse(await jsonBody(request));
  return json(await requestOtp(phone, purpose, source));
}, true);
