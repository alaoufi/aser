import { z } from "zod";
import { api } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { downloadDocument } from "@/server/storage";
export const runtime = "nodejs";
export const GET = api(async (request, context) => {
  const user = await requireUser(request, ["admin"]);
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
