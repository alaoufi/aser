import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminDocuments } from "@/server/management";
/** «مستندات الأسر» في الإدارة: لمن يراجع الأسر فقط. */
export const GET = api(async (request) =>
  json({
    documents: await adminDocuments(
      await requireUser(request),
      new URL(request.url).searchParams.get("q") ?? "",
    ),
  }),
);
