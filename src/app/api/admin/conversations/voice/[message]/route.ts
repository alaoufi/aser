import { api } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminVoice } from "@/server/chat";
import { byteRangeResponse } from "@/server/byte-range";
export const runtime = "nodejs";
type Context = { params: Promise<{ message: string }> };
/** صوت رسالة في محادثة محذوفة، للإدارة فقط. */
export const GET = api(async (request, context: Context) => {
  const { mime, data } = await adminVoice(
    await requireUser(request),
    (await context.params).message,
  );
  return byteRangeResponse(
    data,
    {
      "Content-Type": mime,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
    request.headers.get("range"),
  );
});
