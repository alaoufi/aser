import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminOrders } from "@/server/admin";
export const GET = api(async (request) =>
  json({
    orders: await adminOrders(await requireUser(request)),
  }),
);
