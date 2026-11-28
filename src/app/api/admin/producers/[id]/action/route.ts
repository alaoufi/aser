import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyAdminAction } from "@/server/management";
type Context = { params: Promise<{ id: string }> };
/** قائمة ⋮ في «الأسر المنتجة»: توثيق، إخفاء، إظهار (قرار المالك 2026-11-28). */
export const POST = api(
  async (request, context: Context) =>
    json(
      await familyAdminAction(
        await requireUser(request),
        (await context.params).id,
        await jsonBody(request),
      ),
    ),
  true,
);
