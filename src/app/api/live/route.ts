import { sessionUser } from "@/server/auth";
import { subscribeLive } from "@/server/live";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** بث لحظي (Server-Sent Events) لأحداث محادثات المستخدم: رسالة جديدة أو قراءة. */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("", { status: 401 });
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
      // نبضة كل 25 ثانية تبقي الاتصال مفتوحًا عبر الوسطاء.
      const beat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
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
