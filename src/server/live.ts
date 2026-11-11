import { Client } from "pg";
import { db, databaseConfigured } from "./db";

/**
 * التحديث اللحظي للمحادثات: كل رسالة أو قراءة تُبث عبر قناة PostgreSQL (NOTIFY)،
 * فتصل فورًا لكل نسخة من الخادم، ومنها لمتصفحات أصحابها المفتوحة (Server-Sent Events).
 */
export type LiveEvent = { type: "message" | "read"; c: string };
type Listener = (event: LiveEvent) => void;

const CHANNEL = "jdatna_live";
const listeners = new Map<string, Set<Listener>>();
let client: Client | null = null;
let connecting: Promise<void> | null = null;

function dispatch(payload: string | undefined) {
  if (!payload) return;
  try {
    const { u, ...event } = JSON.parse(payload) as LiveEvent & { u: string[] };
    for (const id of u) for (const fn of listeners.get(id) ?? []) fn(event);
  } catch {
    // رسالة غير مفهومة: تُتجاهل.
  }
}

/** اتصال استماع واحد لكل نسخة من الخادم، يُعاد تلقائيًا عند انقطاعه. */
function ensureListening() {
  if (client || connecting || !databaseConfigured()) return;
  connecting = (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.on("notification", (n) => dispatch(n.payload));
    c.on("error", () => {
      client = null;
      c.end().catch(() => {});
      setTimeout(ensureListening, 2000);
    });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    client = c;
  })()
    .catch(() => {
      setTimeout(ensureListening, 3000);
    })
    .finally(() => {
      connecting = null;
    });
}

export function subscribeLive(userId: string, fn: Listener) {
  ensureListening();
  let set = listeners.get(userId);
  if (!set) listeners.set(userId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(userId);
  };
}

/** يبث حدثًا لهؤلاء المستخدمين؛ لا يُفشل العملية الأصلية إن تعذّر. */
export async function publishLive(
  userIds: string[],
  event: LiveEvent,
  runner: { query: (sql: string, args: unknown[]) => Promise<unknown> } = db(),
) {
  if (!databaseConfigured()) return;
  try {
    await runner.query("SELECT pg_notify($1,$2)", [
      CHANNEL,
      JSON.stringify({ ...event, u: [...new Set(userIds)] }),
    ]);
  } catch {
    // التحديث اللحظي تحسين؛ يبقى التحديث الدوري احتياطًا.
  }
}

/** إغلاق اتصال الاستماع (للاختبارات وإيقاف الخادم). */
export async function stopLive() {
  const c = client;
  client = null;
  listeners.clear();
  if (c) await c.end().catch(() => {});
}
