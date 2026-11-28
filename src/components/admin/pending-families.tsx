"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/components/forms/shared";
import { useTx } from "@/components/site-texts";
import css from "./pending-families.module.css";

const SEEN = "jdatna:pending-families-seen";
type Family = { id: string; name: string; createdAt: string };

/**
 * نافذة عند أول دخول للوحة الإدارة (قرار المالك 2026-11-28): الأسر التي تنتظر الموافقة،
 * وكل أسرة تفتح بطاقتها كاملة (البيانات والمستندات وخيارات القرار الخمسة).
 * تظهر مرة في الجلسة؛ والعدد يبقى في القائمة الجانبية.
 */
export function PendingFamiliesNotice() {
  const { txb } = useTx();
  const [families, setFamilies] = useState<Family[]>([]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN)) return;
    } catch {}
    api<{ families?: Family[] }>("/api/admin/producers/pending")
      .then((d) => setFamilies(d.families ?? []))
      .catch(() => {});
  }, []);
  // Esc يغلق النافذة كأي نافذة منبثقة.
  useEffect(() => {
    if (!families.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      try {
        sessionStorage.setItem(SEEN, "1");
      } catch {}
      setFamilies([]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [families.length]);
  if (!families.length) return null;
  const close = () => {
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    setFamilies([]);
  };
  const day = (iso: string) =>
    new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      timeZone: "Asia/Riyadh",
      dateStyle: "medium",
    }).format(new Date(iso));
  return (
    <div className={css.backdrop}>
      <section
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-families-title"
      >
        <h2 id="pending-families-title">{txb("pendingFamilies.title")}</h2>
        <p>{txb("pendingFamilies.intro", { n: families.length })}</p>
        <ul className={css.list}>
          {families.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {txb("pendingFamilies.registered", {
                    date: day(f.createdAt),
                  })}
                </small>
              </span>
              <Link
                href={`/admin/producers?family=${encodeURIComponent(f.id)}`}
                className={css.open}
                onClick={close}
              >
                {txb("pendingFamilies.open")}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" className={css.later} onClick={close}>
          {txb("pendingFamilies.later")}
        </button>
      </section>
    </div>
  );
}
