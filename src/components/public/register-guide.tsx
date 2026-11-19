"use client";
import { useEffect, useState } from "react";
import { GuideBook, type GuideCopy } from "./guide-book";
import { REGISTER_CHAPTERS } from "./register-guide-content";
import g from "./register-guide.module.css";

const SEEN = "jdatna:register-guide";
const COPY: GuideCopy = {
  label: "دليل التسجيل",
  title: "دليل التسجيل",
  lead: "أنشئ حسابك في دقيقتين، خطوة بخطوة وبالصور",
  backTitle: "أنت جاهز",
  backLead: "أغلق الدليل وابدأ التسجيل من النموذج أسفله.",
};

/**
 * دليل التسجيل في صفحة الدخول والتسجيل: كتاب ثلاثي الأبعاد بصور الخطوات من الموقع نفسه.
 * يظهر مفتوحًا في أول زيارة (autoOpen) ليكون واضحًا، ثم يبقى زرًّا ظاهرًا أعلى النموذج.
 */
export function RegisterGuide({
  version,
  autoOpen = false,
}: {
  version: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (localStorage.getItem(SEEN)) return;
      localStorage.setItem(SEEN, "1");
    } catch {
      // التخزين محجوب: يظهر الدليل في كل زيارة.
    }
    setOpen(true);
  }, [autoOpen]);
  return (
    <section className={g.guide} aria-label="دليل التسجيل">
      <button
        type="button"
        className={g.toggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">📖</span>{" "}
        {open
          ? "إغلاق دليل التسجيل والبدء بالتسجيل"
          : "دليل التسجيل: خطوات إنشاء الحساب بالصور"}
      </button>
      {open && (
        <div className={g.book}>
          <GuideBook
            version={version}
            chapters={REGISTER_CHAPTERS}
            copy={COPY}
            hash={false}
          />
        </div>
      )}
    </section>
  );
}
