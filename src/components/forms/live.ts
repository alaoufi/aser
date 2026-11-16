"use client";
/** حدث لحظي من الخادم: رسالة جديدة أو قراءة في محادثة. */
export type LiveEvent = { type: "message" | "read" | "sync"; c: string };
type Listener = (event: LiveEvent) => void;

// اتصال واحد مشترك لكل مكوّنات الصفحة، يُفتح مع أول مستمع ويُغلق مع آخر واحد.
const listeners = new Set<Listener>();
let source: EventSource | null = null;

function open() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/live");
  // بعد انقطاع وعودة الاتصال: «sync» يجعل كل مستمع يجلب ما فاته فورًا.
  let dropped = false;
  source.onerror = () => {
    dropped = true;
  };
  source.onopen = () => {
    if (!dropped) return;
    dropped = false;
    for (const fn of listeners) fn({ type: "sync", c: "" });
  };
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

let closing: ReturnType<typeof setTimeout> | null = null;
export function onLive(fn: Listener) {
  listeners.add(fn);
  if (closing) {
    clearTimeout(closing);
    closing = null;
  }
  open();
  return () => {
    listeners.delete(fn);
    // التنقل بين المحادثات يزيل المستمعين ويعيدهم في اللحظة نفسها: لا يُغلق الاتصال
    // ويُعاد فتحه (تأخير وفقد أحداث)، بل يُغلق فقط إن بقي بلا مستمع ثواني.
    if (!listeners.size && source && !closing)
      closing = setTimeout(() => {
        closing = null;
        if (!listeners.size && source) {
          source.close();
          source = null;
        }
      }, 5000);
  };
}
