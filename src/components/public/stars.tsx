/** شكل النجمة (24×24). */
export const starPath =
  "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";

/** تدرّج الذهب اللامع للنجوم؛ يوضع مرة واحدة في الصفحة. */
export function StarDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute" }}
    >
      <defs>
        <linearGradient id="jd-star-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6c7" />
          <stop offset="0.45" stopColor="#f4c64a" />
          <stop offset="1" stopColor="#c8871a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * خمس نجوم متدرجة اللمعان (كل نجمة أسطع من التي قبلها) مع عدد المقيّمين.
 * التقييم الكسري يملأ جزء النجمة.
 */
export function Stars({
  value,
  count,
  size = 18,
}: {
  value: number | null;
  count?: number;
  size?: number;
}) {
  const v = value ?? 0;
  const label =
    value === null
      ? "لا توجد تقييمات بعد"
      : `التقييم ${value} من 5${count !== undefined ? ` (${count} تقييم)` : ""}`;
  return (
    <span className="stars" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`star shine-${i + 1}`}
          >
            <path d={starPath} fill="#e7d6b8" />
            {fill > 0 && (
              <path
                d={starPath}
                fill="url(#jd-star-gold)"
                style={{ clipPath: `inset(0 0 0 ${(1 - fill) * 100}%)` }}
              />
            )}
          </svg>
        );
      })}
      {count !== undefined && (
        <small className="stars-count">
          {value === null ? "لا توجد تقييمات بعد" : `${value} · ${count} تقييم`}
        </small>
      )}
    </span>
  );
}
