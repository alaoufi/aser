"use client";
import { useEffect, useRef, useState } from "react";

/** صف الأطباق على المائدة يتحرك يمينًا ويسارًا بسهمين (ويدعم السحب باللمس). */
export function TableCarousel({
  children,
  prevLabel,
  nextLabel,
}: {
  children: React.ReactNode;
  prevLabel: string;
  nextLabel: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const update = () => {
    const el = track.current;
    if (!el) return;
    // في الاتجاه من اليمين لليسار تكون قيمة التمرير صفرًا أو سالبة.
    const pos = Math.abs(el.scrollLeft);
    setEdges({
      start: pos < 4,
      end: pos + el.clientWidth >= el.scrollWidth - 4,
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
    // «التالي» يتجه يسارًا في الصفحة العربية.
    el.scrollBy({
      left: -direction * el.clientWidth * 0.8,
      behavior: "smooth",
    });
  };
  return (
    <div className="table-carousel">
      <button
        type="button"
        className="table-arrow prev"
        aria-label={prevLabel}
        disabled={edges.start}
        onClick={() => move(-1)}
      >
        <span aria-hidden="true">→</span>
      </button>
      <div ref={track} className="table-track">
        {children}
      </div>
      <button
        type="button"
        className="table-arrow next"
        aria-label={nextLabel}
        disabled={edges.end}
        onClick={() => move(1)}
      >
        <span aria-hidden="true">←</span>
      </button>
    </div>
  );
}
