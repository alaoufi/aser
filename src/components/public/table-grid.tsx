"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { priceLabel, safeMediaUrl } from "./ui";

type Texts = {
  title: string;
  prev: string;
  next: string;
  hint: string;
  details: string;
  shipping: string;
};

const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 350;

/**
 * «مائدة اليوم» في الرئيسية (طلب المالك 2026-11-28): المائدة ممتلئة بصور المنتجات صفوفًا، بلا كتابة،
 * والصور تغطي كلمة «مائدة اليوم» عادي. السهمان خارج المائدة يقلّبان الصفحات.
 * ضغطة على الطبق تكتب بياناته تحت المائدة؛ ويفتح تفاصيله: الضغط على البيانات، أو ضغطة مطوّلة، أو نقرتان.
 */
export function TableGrid({
  products,
  texts,
}: {
  products: Product[];
  texts: Texts;
}) {
  const router = useRouter();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [picked, setPicked] = useState<string | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const update = () => {
    const el = track.current;
    if (!el) return;
    // في الاتجاه من اليمين لليسار تكون قيمة التمرير صفرًا أو سالبة.
    const pos = Math.abs(el.scrollLeft);
    setEdges({
      start: pos < 4,
      // سماحة بمقدار مسافة بين عمودين: لا أسهم إن اتسعت المائدة لكل الأطباق.
      end: pos + el.clientWidth >= el.scrollWidth - 24,
    });
  };
  useEffect(() => {
    update();
    const el = track.current;
    el?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const move = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    // «التالي» يتجه يسارًا في الصفحة العربية، صفحة كاملة كل مرة.
    el.scrollBy({ left: -direction * el.clientWidth, behavior: "smooth" });
  };
  const open = (id: string) => router.push(`/products/${id}`);
  const tap = (id: string) => {
    // الضغطة المطوّلة فتحت التفاصيل: لا تُحسب ضغطة.
    if (press.current?.fired) return;
    const now = Date.now();
    if (
      lastTap.current?.id === id &&
      now - lastTap.current.at < DOUBLE_TAP_MS
    ) {
      lastTap.current = null;
      open(id);
      return;
    }
    lastTap.current = { id, at: now };
    setPicked(id);
  };
  const startPress = (id: string) => {
    endPress();
    press.current = {
      fired: false,
      timer: window.setTimeout(() => {
        if (press.current) press.current.fired = true;
        open(id);
      }, LONG_PRESS_MS),
    };
  };
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const chosen = products.find((p) => p.id === picked);
  // الصفوف حسب العدد: لا صفوف فارغة إن قلّت المنتجات.
  const rows = (cols: number) =>
    Math.min(3, Math.max(1, Math.ceil(products.length / cols)));
  return (
    <>
      <div className="table-paged">
        <button
          type="button"
          className="table-arrow prev"
          aria-label={texts.prev}
          disabled={edges.start}
          hidden={edges.start && edges.end}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">→</span>
        </button>
        <div className="table-3d">
          <div className="table-top">
            {(["bottom", "top", "right", "left"] as const).map((side) => (
              <span
                key={side}
                className={`table-watermark is-${side}`}
                aria-hidden="true"
              >
                {texts.title}
              </span>
            ))}
            <div ref={track} className="table-track">
              <ul
                className="table-dishes is-grid"
                style={
                  {
                    "--rows-s": rows(3),
                    "--rows-m": rows(4),
                    "--rows-l": rows(6),
                  } as React.CSSProperties
                }
              >
                {products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="table-plate"
                      aria-label={p.name}
                      aria-pressed={picked === p.id}
                      aria-controls="table-picked"
                      onClick={() => tap(p.id)}
                      onPointerDown={() => startPress(p.id)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onPointerCancel={endPress}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {p.imageUrl && safeMediaUrl(p.imageUrl) ? (
                        <img
                          src={p.imageUrl}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <span aria-hidden="true">♨</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <span className="table-leg leg-1" aria-hidden="true" />
          <span className="table-leg leg-2" aria-hidden="true" />
          <span className="table-leg leg-3" aria-hidden="true" />
          <span className="table-leg leg-4" aria-hidden="true" />
        </div>
        <button
          type="button"
          className="table-arrow next"
          aria-label={texts.next}
          disabled={edges.end}
          hidden={edges.start && edges.end}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">←</span>
        </button>
      </div>
      <div id="table-picked" className="table-picked" aria-live="polite">
        {chosen ? (
          <Link href={`/products/${chosen.id}`} className="table-picked-card">
            <strong>{chosen.name}</strong>
            {chosen.producerName && <span>{chosen.producerName}</span>}
            <span className="table-picked-price">
              {priceLabel(chosen.price)}
            </span>
            {chosen.deliveryScope === "kingdom" && texts.shipping && (
              <em className="dish-shipping">{texts.shipping}</em>
            )}
            <span className="table-picked-open">
              {texts.details} <span aria-hidden="true">←</span>
            </span>
          </Link>
        ) : (
          texts.hint && <p className="table-picked-hint">{texts.hint}</p>
        )}
      </div>
    </>
  );
}
