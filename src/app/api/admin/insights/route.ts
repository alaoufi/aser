import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminInsights } from "@/server/insights";
// إحصاءات الإدارة الرئيسية (للمدير الكامل): ?days=7|30|90|365.
export const GET = api(async (request) =>
  json(
    await adminInsights(
      await requireUser(request),
      new URL(request.url).searchParams.get("days") ?? 30,
    ),
  ),
);
