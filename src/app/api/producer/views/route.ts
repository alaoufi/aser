import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyViews } from "@/server/views";
/** لوحة الأسرة ← «المشاهدات»: أرقام الأسرة صاحبة الحساب فقط. */
export const GET = api(async (request) =>
  json(await familyViews(await requireUser(request))),
);
