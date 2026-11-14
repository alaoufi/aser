import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { pendingApprovals } from "@/server/management";
export const GET = api(async (request) =>
  json(await pendingApprovals(await requireUser(request))),
);
