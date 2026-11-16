import { sessionUser } from "@/server/auth";
import { subscribeLive } from "@/server/live";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** حد الاتصالات اللحظية المفتوحة معًا لكل حساب (نوافذ وأجهزة): يمنع استنزاف الخادم. */
const MAX_STREAMS = 8;
const open: Map<string, number> = ((
  globalThis as unknown as { __jdatnaLive?: Map<string, number> }
).__jdatnaLive ??= new Map());

/** بث لحظي (Server-Sent Events) لأحداث محادثات المستخدم: رسالة جديدة أو قراءة. */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("", { status: 401 });
  if ((open.get(user.id) ?? 0) >= MAX_STREAMS)
    return new Response("", {
      status: 429,
      headers: { "Retry-After": "30", "Cache-Control": "no-store" },
    });
  open.set(user.id, (open.get(user.id) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (open.get(user.id) ?? 1) - 1;
    if (n > 0) open.set(user.id, n);
    else open.delete(user.id);
  };
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribeLive(user.id, (event) =>
        send(`data: ${JSON.stringify(event)}\n\n`),
      );
      // نبضة كل 25 ثانية تبقي الاتصال مفتوحًا عبر الوسطاء، ومعها فحص الجلسة:
      // بعد الخروج أو الإيقاف أو انتهاء الجلسة يُغلق البث.
      const beat = setInterval(() => {
        send(": ping\n\n");
        sessionUser(request)
          .then((u) => {
            if (u?.id !== user.id) cleanup();
          })
          .catch(() => {});
      }, 25_000);
      cleanup = () => {
        release();
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
