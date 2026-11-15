import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminCouriers } from "@/server/couriers";
export const GET = api(async (request) =>
  json({ couriers: await adminCouriers(await requireUser(request)) }),
);
