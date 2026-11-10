import { z } from "zod";
import { api } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { downloadDocument } from "@/server/storage";
import { can } from "@/lib/permissions";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
export const GET = api(async (request, context) => {
  const user = await requireUser(request, ["admin", "staff"]);
  // المستندات الخاصة لمن يراجع الأسر فقط.
  if (!can(user, "producers"))
    throw new HttpError(403, "لا تملك صلاحية الوصول");
  await rateLimit("download:" + user.id, 60, 3600);
  const { id } = await context.params;
  const doc = await downloadDocument(z.uuid().parse(id), user.id);
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": 'attachment; filename="document"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
