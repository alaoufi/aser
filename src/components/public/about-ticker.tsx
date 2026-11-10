"use client";

import { useState } from "react";

export function AboutTicker({ text: introduction }: { text: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <aside className="about-ticker" aria-label="نبذة عن أكلات جدتنا">
      <p className="sr-only">{introduction}</p>
      <div className="about-ticker-window" aria-hidden="true">
        <div className="about-ticker-track" data-paused={paused}>
          {[0, 1].map((copy) => (
            <div className="about-ticker-copy" key={copy}>
              <span>{introduction}</span>
              <span className="ticker-star">✦</span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="about-ticker-toggle"
        aria-label={paused ? "تشغيل حركة الشريط" : "إيقاف حركة الشريط"}
        onClick={() => setPaused(!paused)}
      >
        <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
      </button>
    </aside>
  );
}
