import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { requestOtp, otpPurposeSchema } from "@/server/auth";
export const POST = api(async (request) => {
  const { phone, purpose } = z
    .object({ phone: z.string().max(25), purpose: otpPurposeSchema })
    .strict()
    .parse(await jsonBody(request));
  return json(await requestOtp(phone, purpose));
}, true);
