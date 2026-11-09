"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSession } from "@/components/forms/shared";

type Alert = {
  id: string;
  productName: string;
  name: string;
  quantity: number;
  unit: string;
  meal: string;
  startDate: string;
};
const meals: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "مناسبة",
};
const POLL_MS = 30_000;
export const ORDERS_CHANGED = "jdatna:orders-changed";

function chime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const tone = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + at + 0.35,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.4);
    };
    tone(660, 0);
    tone(880, 0.18);
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // الصوت اختياري؛ قد يمنعه المتصفح قبل أي تفاعل.
  }
}

/** رسالة منبثقة «لديك طلب جديد» لحساب الأسرة المنتجة، تتحدث كل 30 ثانية أثناء فتح الموقع. */
export function OrderAlert() {
  const { user } = useSession();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = useRef(new Set<string>());
  const isProducer = user?.role === "producer";

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const result = await api<{ alerts: Alert[]; pending: number }>(
        "/api/producer/orders/alerts",
      );
      const fresh = result.alerts.filter((a) => !shown.current.has(a.id));
      setAlerts(result.alerts);
      if (fresh.length) {
        for (const a of fresh) shown.current.add(a.id);
        window.dispatchEvent(new Event(ORDERS_CHANGED));
        chime();
      }
    } catch {
      // انقطاع مؤقت أو انتهاء الجلسة: نعيد المحاولة في الدورة التالية.
    }
  }, []);

  useEffect(() => {
    if (!isProducer) return;
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isProducer, check]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (alerts.length && !el.open) el.showModal?.();
    if (!alerts.length && el.open) el.close();
  }, [alerts]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = alerts.length ? `(${alerts.length}) ${base}` : base;
  }, [alerts.length]);

  async function acknowledge() {
    const ids = alerts.map((a) => a.id);
    setAlerts([]);
    if (!ids.length) return;
    await api("/api/producer/orders/alerts", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    window.dispatchEvent(new Event(ORDERS_CHANGED));
  }

  if (!isProducer) return null;
  const count = alerts.length;
  return (
    <dialog
      ref={dialog}
      className="order-alert"
      aria-labelledby="order-alert-title"
      onCancel={(event) => {
        event.preventDefault();
        acknowledge();
      }}
    >
      <div className="order-alert-head">
        <span className="order-alert-mark" aria-hidden="true" />
        <h2 id="order-alert-title">
          {count > 1 ? `لديك ${count} طلبات جديدة` : "لديك طلب جديد"}
        </h2>
      </div>
      <ul className="order-alert-list">
        {alerts.slice(0, 3).map((a) => (
          <li key={a.id}>
            <strong>{a.productName}</strong>
            <span>
              {a.name} — {a.quantity} {a.unit}، {meals[a.meal] ?? a.meal}، من{" "}
              <bdi>{a.startDate}</bdi>
            </span>
          </li>
        ))}
      </ul>
      {count > 3 && <p className="order-alert-more">و{count - 3} غيرها</p>}
      <div className="order-alert-actions">
        <Link
          href="/dashboard/orders"
          className="button"
          onClick={() => acknowledge()}
        >
          عرض الطلب والرد عليه
        </Link>
        <button type="button" className="button light" onClick={acknowledge}>
          لاحقًا
        </button>
      </div>
    </dialog>
  );
}
