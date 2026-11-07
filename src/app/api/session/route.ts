import { api, json } from "@/server/http";
import { sessionUser, registrationOpen } from "@/server/auth";
export const GET = api(async (request) =>
  json({
    user: await sessionUser(request),
    registrationOpen: registrationOpen(),
  }),
);
