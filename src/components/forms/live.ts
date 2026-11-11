"use client";
/** حدث لحظي من الخادم: رسالة جديدة أو قراءة في محادثة. */
export type LiveEvent = { type: "message" | "read"; c: string };
type Listener = (event: LiveEvent) => void;

// اتصال واحد مشترك لكل مكوّنات الصفحة، يُفتح مع أول مستمع ويُغلق مع آخر واحد.
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/live");
  source.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as LiveEvent;
      for (const fn of listeners) fn(event);
    } catch {
      // تجاهل ما لا يُفهم.
    }
  };
  // المتصفح يعيد الاتصال تلقائيًا؛ عند انتهاء الجلسة (401) يتوقف ونعتمد على التحديث الدوري.
}

export function onLive(fn: Listener) {
  listeners.add(fn);
  open();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && source) {
      source.close();
      source = null;
    }
  };
}
