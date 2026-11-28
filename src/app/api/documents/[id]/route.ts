import { z } from "zod";
import { api } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { downloadDocument } from "@/server/storage";
import { canAny } from "@/lib/permissions";
export const runtime = "nodejs";
const VIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const GET = api(async (request, context) => {
  const user = await requireUser(request);
  // المستندات الخاصة لمن يراجع الأسر، ولصاحب المستند نفسه.
  await rateLimit("download:" + user.id, 60, 3600);
  const { id } = await context.params;
  const doc = await downloadDocument(
    z.uuid().parse(id),
    user.id,
    canAny(user, "approvals", "producers"),
  );
  // ?view=1: يُفتح في المتصفح (قرار المالك 2026-11-27) للصور وPDF فقط؛ غيرها يُنزَّل كما كان.
  const inline =
    new URL(request.url).searchParams.get("view") === "1" &&
    VIEWABLE.has(doc.mime);
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": inline
        ? "inline"
        : 'attachment; filename="document"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // عارض PDF في المتصفح لا يعمل مع sandbox؛ الصورة وPDF وحدهما يُعرضان، بلا سكربت.
      "Content-Security-Policy": inline
        ? "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'"
        : "default-src 'none'; sandbox",
    },
  });
});
