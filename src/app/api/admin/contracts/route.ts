import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminContracts } from "@/server/subscriptions";
/** الإدارة ← «عقود الاشتراكات». */
export const GET = api(async (request) =>
  json({ contracts: await adminContracts(await requireUser(request)) }),
);
