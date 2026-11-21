import { api } from "@/server/http";
import { adMedia } from "@/server/ads";
export const runtime = "nodejs";
/** صورة الإعلان أو مقطعه: عامة، ولا تتغير بعد رفعها (كل رفع بمعرّف جديد). */
export const GET = api(async (_request, context) => {
  const { id } = await context.params;
  const media = await adMedia(id);
  return new Response(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
