import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminSummary } from "@/server/admin";
export const GET = api(async (request) =>
  json({
    summary: await adminSummary(await requireUser(request)),
  }),
);
