"use client";
import { T } from "@/components/site-texts";
import { useEffect, useState } from "react";
import { AD_FRAME, type Placement } from "@/lib/ads";
import css from "./ad-slot.module.css";

/**
 * مكان إعلان (من «أي خدمة»، AdSlot): الإعلانات العاملة في هذا المكان لهذا الزائر.
 * - إطار ثابت 1200×400 (AYK-408): الصورة لا تمطّط المكان ولا تكبّره.
 * - إعلان الإدارة بلا كلمة «إعلان» (AYK-404)، وزر ✕ صغير يخفيه على هذا الجهاز.
 * - المشاهدة تُحسب مرة لكل صفحة، والحد اليومي لكل زائر على جهازه (AYK-409).
 * - آخر إعلانات المكان محفوظة في الجهاز (عامة)، فتظهر مع الصفحة بلا قفزة (AYK-328).
 */
type Ad = {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  media: string | null;
  mediaType: "image" | "video";
  promo: boolean;
  freqCap: number | null;
};
const CACHE = "jdatna:ads:";
const HIDDEN = "jdatna:ads-hidden";
const FREQ = "jdatna:ads-freq";
const SEEN = "jdatna:ads-seen";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
const read = <T,>(store: Storage, key: string, fallback: T): T => {
  try {
    const v = JSON.parse(store.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (store: Storage, key: string, value: unknown) => {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // تصفح خاص: لهذه الزيارة فقط.
  }
};
function visible(rows: Ad[]) {
  const hidden = new Set(read<string[]>(localStorage, HIDDEN, []));
  const freq = read<{ day: string; n: Record<string, number> }>(
    localStorage,
    FREQ,
    {
      day: today(),
      n: {},
    },
  );
  const n = freq.day === today() ? freq.n : {};
  return rows.filter(
    (ad) =>
      !hidden.has(ad.id) && !(ad.freqCap && (n[ad.id] ?? 0) >= ad.freqCap),
  );
}
function countShown(id: string) {
  const seen = read<string[]>(sessionStorage, SEEN, []);
  if (seen.includes(id)) return false;
  write(sessionStorage, SEEN, [...seen, id].slice(-100));
  const freq = read<{ day: string; n: Record<string, number> }>(
    localStorage,
    FREQ,
    {
      day: today(),
      n: {},
    },
  );
  const n = freq.day === today() ? freq.n : {};
  n[id] = (n[id] ?? 0) + 1;
  write(localStorage, FREQ, { day: today(), n });
  return true;
}
const send = (id: string, event: "view" | "click") =>
  fetch(`/api/ads/${id}/${event}`, { method: "POST", keepalive: true }).catch(
    () => {},
  );
const safeLink = (link: string | null) =>
  link && (/^https:\/\//.test(link) || /^\/(?!\/)/.test(link)) ? link : null;

export function AdSlot({
  placement,
  max = 1,
  className = "",
}: {
  placement: Placement;
  max?: number;
  className?: string;
}) {
  const [ads, setAds] = useState<Ad[]>([]);
  useEffect(() => {
    let live = true;
    const cached = read<Ad[] | null>(localStorage, CACHE + placement, null);
    if (cached) setAds(visible(cached).slice(0, max));
    fetch(`/api/ads?placement=${placement}`)
      .then((r) => (r.ok ? r.json() : { ads: [] }))
      .then((d: { ads: Ad[] }) => {
        write(localStorage, CACHE + placement, d.ads);
        if (live) setAds(visible(d.ads).slice(0, max));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [placement, max]);
  useEffect(() => {
    for (const ad of ads) if (countShown(ad.id)) void send(ad.id, "view");
  }, [ads]);
  if (!ads.length) return null;
  return (
    <div className={`${css.slot} ${className}`} data-placement={placement}>
      {ads.map((ad) => {
        const link = safeLink(ad.link);
        const external = Boolean(link?.startsWith("https://"));
        const body = (
          <>
            {ad.media && (
              <div
                className={css.frame}
                style={{
                  aspectRatio: `${AD_FRAME.width} / ${AD_FRAME.height}`,
                }}
              >
                {ad.mediaType === "video" ? (
                  <video src={ad.media} autoPlay muted loop playsInline />
                ) : (
                  // biome-ignore lint/performance/noImgElement: صورة الإعلان من الخادم بإطار ثابت
                  <img src={ad.media} alt={ad.title} loading="lazy" />
                )}
              </div>
            )}
            {(ad.title || ad.description) && (
              <div className={ad.media ? css.caption : css.textOnly}>
                <strong>{ad.title}</strong>
                {ad.description && <span>{ad.description}</span>}
              </div>
            )}
            {!ad.promo && (
              <span className={css.mark}>
                <T k="c.ads.t1" />
              </span>
            )}
          </>
        );
        return (
          <div key={ad.id} className={css.ad}>
            {link ? (
              <a
                href={link}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer sponsored" : undefined}
                onClick={() => void send(ad.id, "click")}
              >
                {body}
              </a>
            ) : (
              <div>{body}</div>
            )}
            <button
              type="button"
              className={css.hide}
              aria-label="إخفاء الإعلان"
              title="إخفاء الإعلان"
              onClick={() => {
                const hidden = read<string[]>(localStorage, HIDDEN, []);
                write(localStorage, HIDDEN, [...hidden, ad.id].slice(-300));
                setAds((rows) => rows.filter((r) => r.id !== ad.id));
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
