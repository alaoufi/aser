import { api, json } from "@/server/http";
import { sessionUser } from "@/server/auth";
import { listOffers } from "@/server/offers";
export const GET = api(async (request) =>
  json({ offers: await listOffers(await sessionUser(request)) }),
);
