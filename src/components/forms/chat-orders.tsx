"use client";
import { useEffect, useState } from "react";
import { api, useSiteTexts } from "./session";
import o from "./chat-orders.module.css";

type Action =
  | "complete"
  | "decline"
  | "cancel"
  | "request-cancel"
  | "agree-cancel"
  | "keep";
type Order = {
  id: string;
  productName: string;
  unit: string;
  price: number | null;
  quantity: number;
  notes: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  cancelRequestedByMe: boolean;
  cancelUntil: string | null;
  actions: Action[];
};
type Product = { id: string; name: string; unit: string; price: number | null };
type Data = {
  side: "customer" | "producer";
  orders: Order[];
  products: Product[];
};

/** رد غير متوقع لا يكسر المحادثة: يُخفى شريط الطلبات فقط. */
const valid = (d: Data | null | undefined): Data | null =>
  d && Array.isArray(d.orders) && Array.isArray(d.products) ? d : null;

const ACTION_KEYS = {
  complete: "chatOrder.complete",
  decline: "chatOrder.decline",
  cancel: "chatOrder.cancel",
  "request-cancel": "chatOrder.requestCancel",
  "agree-cancel": "chatOrder.agreeCancel",
  keep: "chatOrder.keep",
} as const;

/**
 * الطلب داخل المحادثة (قرار المالك 2026-11-27): بطاقات الطلبات فوق الرسائل، وزر «اطلب» للعميل،
 * و«موافقة وإتمام» للأسرة، والإلغاء خلال ١٠ دقائق من الإتمام، وبعدها بالاتفاق.
 * refreshKey: آخر رسالة في المحادثة؛ كل خطوة تُكتب رسالة، فيتحدث الطرفان معًا.
 */
export function ChatOrders({
  conversationId,
  refreshKey,
}: {
  conversationId: string;
  refreshKey?: string;
}) {
  const { tx } = useSiteTexts();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const url = `/api/conversations/${encodeURIComponent(conversationId)}/orders`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey يعيد الجلب عند كل رسالة جديدة
  useEffect(() => {
    let live = true;
    api<Data>(url)
      .then((d) => live && setData(valid(d)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url, refreshKey]);
  // العدّاد التنازلي لمهلة الإلغاء.
  const counting = data?.orders.some(
    (x) => x.cancelUntil && Date.parse(x.cancelUntil) > now,
  );
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);
  // انتهاء المهلة يغيّر الأزرار المتاحة: يُعاد الجلب من الخادم.
  const nextExpiry = data?.orders
    .map((x) => (x.cancelUntil ? Date.parse(x.cancelUntil) : 0))
    .filter((t) => t > Date.now())
    .sort()[0];
  useEffect(() => {
    if (!nextExpiry) return;
    const t = setTimeout(
      () =>
        api<Data>(url)
          .then((d) => setData(valid(d)))
          .catch(() => {}),
      nextExpiry - Date.now() + 500,
    );
    return () => clearTimeout(t);
  }, [nextExpiry, url]);

  if (!data) return null;
  const canOrder = data.side === "customer" && data.products.length > 0;
  if (!canOrder && data.orders.length === 0) return null;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setData(
        valid(
          await api<Data>(url, { method: "POST", body: JSON.stringify(body) }),
        ),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (x: Order) =>
    x.status === "completed"
      ? x.cancelRequestedAt
        ? tx("chatOrder.status.cancelRequested")
        : tx("chatOrder.status.completed")
      : x.status === "cancelled"
        ? tx("chatOrder.status.cancelled")
        : x.status === "declined"
          ? tx("chatOrder.status.declined")
          : tx("chatOrder.status.pending");
  const left = (x: Order) => {
    const ms = x.cancelUntil ? Date.parse(x.cancelUntil) - now : 0;
    if (ms <= 0) return "";
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <section className={o.bar} aria-label={tx("chatOrder.title")}>
      {data.orders.length > 0 && (
        <ul className={o.list}>
          {data.orders.slice(0, open ? 20 : 3).map((x) => (
            <li key={x.id} className={o.card} data-status={x.status}>
              <div className={o.top}>
                <strong>
                  🧾 {x.productName} × {x.quantity}
                </strong>
                <span className={o.status}>{statusLabel(x)}</span>
              </div>
              {x.notes && <p className={o.note}>{x.notes}</p>}
              {left(x) && (
                <p className={o.hint}>
                  {tx("chatOrder.cancelWindow", { time: left(x) })}
                </p>
              )}
              {x.cancelRequestedAt && (
                <p className={o.hint}>
                  {x.cancelRequestedByMe
                    ? tx("chatOrder.waitingOther")
                    : tx("chatOrder.otherAsks")}
                </p>
              )}
              {x.actions.length > 0 && (
                <div className={o.actions}>
                  {x.actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy}
                      className={
                        a === "complete" || a === "agree-cancel" || a === "keep"
                          ? o.primary
                          : o.secondary
                      }
                      onClick={() => post({ orderId: x.id, action: a })}
                    >
                      {tx(ACTION_KEYS[a])}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canOrder && !open && (
        <button
          type="button"
          className={o.orderButton}
          onClick={() => setOpen(true)}
        >
          {tx("chatOrder.button")}
        </button>
      )}
      {canOrder && open && (
        <form
          className={o.form}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await post({
              productId: String(f.get("productId") ?? ""),
              quantity: Number(f.get("quantity") ?? 1),
              notes: String(f.get("notes") ?? ""),
            });
            if (ok) setOpen(false);
          }}
        >
          <label>
            {tx("chatOrder.product")}
            <select
              name="productId"
              required
              defaultValue={data.products[0]?.id}
            >
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.price !== null ? ` — ${p.price} ر.س / ${p.unit}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tx("chatOrder.quantity")}
            <input
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              defaultValue={1}
              required
            />
          </label>
          <label>
            {tx("chatOrder.notes")}
            <textarea name="notes" rows={2} maxLength={500} />
          </label>
          <p className={o.hint}>{tx("chatOrder.formHint")}</p>
          <div className={o.actions}>
            <button type="submit" className={o.primary} disabled={busy}>
              {tx("chatOrder.send")}
            </button>
            <button
              type="button"
              className={o.secondary}
              onClick={() => setOpen(false)}
            >
              {tx("chatOrder.close")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className={o.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
