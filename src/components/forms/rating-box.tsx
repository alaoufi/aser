"use client";
import { useEffect, useState } from "react";
import { Stars, starPath } from "@/components/public/stars";
import { api, useSession } from "./shared";

type View = {
  average: number | null;
  count: number;
  mine: { stars: number; comment: string } | null;
  canRate: boolean;
};

/** ملخص التقييم، ونموذج «رأيك مهم؟» لمن تعامل فعليًا. */
export function RatingBox({
  kind,
  target,
  title,
  prompt = "رأيك مهم؟",
  compact = false,
}: {
  kind: "family" | "product" | "member";
  target: string;
  title: string;
  prompt?: string;
  compact?: boolean;
}) {
  const session = useSession();
  const [view, setView] = useState<View | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session.ready) return;
    api<View>(`/api/ratings?kind=${kind}&target=${encodeURIComponent(target)}`)
      .then((v) => {
        setView(v);
        setStars(v.mine?.stars ?? 0);
        setComment(v.mine?.comment ?? "");
      })
      .catch(() => setView(null));
  }, [kind, target, session.ready, session.user?.id]);
  if (!view) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stars) {
      setError("اختر عدد النجوم.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const summary = await api<{ average: number | null; count: number }>(
        "/api/ratings",
        {
          method: "PUT",
          body: JSON.stringify({ kind, target, stars, comment }),
        },
      );
      setView((v) => v && { ...v, ...summary, mine: { stars, comment } });
      setMessage("شكرًا، تم حفظ تقييمك.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`rating-box${compact ? " compact" : ""}`}
      aria-label={title}
    >
      <div className="rating-summary">
        {!compact && <h3>{title}</h3>}
        <Stars value={view.average} count={view.count} />
      </div>
      {view.canRate && (
        <form onSubmit={submit} className="rating-form">
          <fieldset>
            <legend>{prompt}</legend>
            <div className="star-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={n <= stars ? "on" : ""}>
                  <input
                    type="radio"
                    name={`stars-${kind}-${target}`}
                    value={n}
                    checked={stars === n}
                    onChange={() => setStars(n)}
                  />
                  <span className="sr-only">{n} من 5</span>
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`star shine-${n}`}
                  >
                    <path
                      d={starPath}
                      fill={n <= stars ? "url(#jd-star-gold)" : "#e7d6b8"}
                    />
                  </svg>
                </label>
              ))}
            </div>
          </fieldset>
          {!compact && (
            <label className="rating-comment">
              <span className="sr-only">تعليقك (اختياري)</span>
              <textarea
                rows={2}
                maxLength={500}
                placeholder="تعليقك (اختياري)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
          )}
          <button className="button small" disabled={busy}>
            {busy
              ? "جارٍ الحفظ…"
              : view.mine
                ? "تحديث تقييمي"
                : "إرسال التقييم"}
          </button>
          <div aria-live="polite">
            {message && <p className="rating-ok">{message}</p>}
            {error && (
              <p role="alert" className="rating-error">
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
