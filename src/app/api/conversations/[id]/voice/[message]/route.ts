import { api } from "@/server/http";
import { requireUser } from "@/server/auth";
import { voiceOf } from "@/server/chat";
import { byteRangeResponse } from "@/server/byte-range";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; message: string }> };
/** تشغيل الرسالة الصوتية لطرفي المحادثة فقط. */
export const GET = api(async (request, context: Context) => {
  const user = await requireUser(request);
  const { id, message } = await context.params;
  const { mime, data } = await voiceOf(user, id, message);
  return byteRangeResponse(
    data,
    {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
    request.headers.get("range"),
  );
});
