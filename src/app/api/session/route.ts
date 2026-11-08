import { api, json } from "@/server/http";
import { sessionInfo, registrationOpen } from "@/server/auth";
export const GET = api(async (request) => {
  const info = await sessionInfo(request);
  return json({
    user: info?.user ?? null,
    registrationOpen: registrationOpen(),
    hasPassword: info?.hasPassword ?? false,
    canSetCredentials: info?.canSetCredentials ?? false,
  });
});
