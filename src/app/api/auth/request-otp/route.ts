import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { requestOtp } from "@/server/auth";
export const POST = api(async (request) => {
  const { phone } = z
    .object({ phone: z.string().max(25) })
    .parse(await jsonBody(request));
  return json(await requestOtp(phone));
}, true);
