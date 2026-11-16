"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuideArt } from "./guide-art";
import { GUIDE_CHAPTERS, type GuideChapter } from "./guide-content";
import b from "./guide-book.module.css";

type Page =
  | { kind: "cover" }
  | { kind: "toc" }
  | { kind: "chapter"; chapter: GuideChapter; number: number }
  | { kind: "blank" }
  | { kind: "back" };

const pages: Page[] = [
  { kind: "cover" },
  { kind: "toc" },
  ...GUIDE_CHAPTERS.map((chapter, i) => ({
    kind: "chapter" as const,
    chapter,
    number: i + 1,
  })),
];
// الغلاف الخلفي على ظهر آخر ورقة: عدد الصفحات زوجي دائمًا.
if (pages.length % 2 === 0) pages.push({ kind: "blank" });
pages.push({ kind: "back" });

const chapterPage = (id: string) =>
  pages.findIndex((p) => p.kind === "chapter" && p.chapter.id === id);

/**
 * دليل المستخدم على هيئة كتاب ثلاثي الأبعاد يُقلَّب من اليمين إلى اليسار كالكتاب العربي:
 * صفحتان متقابلتان على الشاشة الواسعة، وصفحة واحدة على الجوال. النص كله في الصفحة
 * (لمحركات البحث وقارئ الشاشة)، والصفحات المطوية خاملة (inert) حتى تُفتح.
 */
export function GuideBook({ version }: { version: string }) {
  const [narrow, setNarrow] = useState(false);
  const [flat, setFlat] = useState(false);
  // الصفحة الحالية: أول صفحة ظاهرة (يمنى في العرض المزدوج).
  const [page, setPage] = useState(0);
  const touch = useRef<number | null>(null);
  const live = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const q = window.matchMedia("(max-width: 760px)");
    const sync = () => setNarrow(q.matches);
    sync();
    q.addEventListener("change", sync);
    const fromHash = chapterPage(decodeURIComponent(location.hash.slice(1)));
    if (fromHash > 0) setPage(fromHash);
    return () => q.removeEventListener("change", sync);
  }, []);

  // المزدوج: عدد الأوراق المقلوبة f يُظهر الصفحتين 2f-1 (يمين) و2f (يسار).
  const flipped = narrow ? page : Math.floor((page + 1) / 2);
  const leaves = narrow ? pages.length : pages.length / 2;
  const last = leaves - (narrow ? 1 : 0);
  const visible = narrow ? [page] : [flipped * 2 - 1, flipped * 2];

  const go = useCallback((to: number, hash?: string) => {
    const target = Math.max(0, Math.min(pages.length - 1, to));
    setPage(target);
    const p = pages[target];
    history.replaceState(
      null,
      "",
      hash ?? (p.kind === "chapter" ? `#${p.chapter.id}` : location.pathname),
    );
  }, []);
  const step = (dir: 1 | -1) => {
    const f = Math.max(0, Math.min(last, flipped + dir));
    go(narrow ? f : Math.max(0, f * 2 - 1));
  };

  useEffect(() => {
    if (flat) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      // الكتاب عربي: السهم الأيسر للصفحة التالية، والأيمن للسابقة.
      if (e.key === "ArrowLeft") step(1);
      else if (e.key === "ArrowRight") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const label =
    flipped === 0
      ? "الغلاف"
      : flipped >= last
        ? "الغلاف الخلفي"
        : narrow
          ? `صفحة ${page} من ${pages.length - 2}`
          : `الصفحتان ${visible[0]} و${Math.min(visible[1], pages.length - 2)} من ${pages.length - 2}`;
  useEffect(() => {
    if (live.current) live.current.textContent = label;
  }, [label]);

  const face = (index: number) => {
    const p = pages[index];
    if (!p) return <div className={b.blankFace} />;
    return <PageFace page={p} index={index} version={version} go={go} />;
  };

  return (
    <div className={`${b.guide} ${flat ? b.flat : ""}`}>
      <div className={b.toolbar}>
        <button
          type="button"
          className={b.modeButton}
          aria-pressed={flat}
          onClick={() => setFlat((v) => !v)}
        >
          {flat ? "عرض الكتاب ثلاثي الأبعاد" : "عرض الدليل نصًّا متصلًا"}
        </button>
        {flat && (
          <button
            type="button"
            className={b.modeButton}
            onClick={() => window.print()}
          >
            طباعة الدليل
          </button>
        )}
      </div>
      {flat ? (
        <div className={b.flatPages}>
          {pages.map((p, i) =>
            p.kind === "blank" ? null : (
              <section key={i} className={b.flatPage}>
                <PageFace page={p} index={i} version={version} go={go} flat />
              </section>
            ),
          )}
        </div>
      ) : (
        <section
          className={b.stage}
          aria-roledescription="كتاب"
          aria-label="دليل المستخدم"
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            // سحب من اليسار إلى اليمين = الصفحة التالية في الكتاب العربي.
            if (Math.abs(dx) > 50) step(dx > 0 ? 1 : -1);
          }}
        >
          <div
            className={`${b.book} ${narrow ? b.single : b.double}`}
            data-state={
              flipped === 0 ? "closed" : flipped >= last ? "end" : "open"
            }
          >
            {Array.from({ length: leaves }, (_, i) => {
              const isFlipped = i < flipped;
              const front = narrow ? i : i * 2;
              const back = narrow ? -1 : i * 2 + 1;
              return (
                <div
                  key={i}
                  className={`${b.leaf} ${isFlipped ? b.flipped : ""}`}
                  style={{ zIndex: isFlipped ? i + 1 : leaves - i }}
                >
                  <div
                    className={`${b.face} ${b.front}`}
                    inert={!visible.includes(front)}
                    aria-hidden={!visible.includes(front)}
                  >
                    {face(front)}
                  </div>
                  <div
                    className={`${b.face} ${b.back}`}
                    inert={back < 0 || !visible.includes(back)}
                    aria-hidden={back < 0 || !visible.includes(back)}
                  >
                    {back < 0 ? <div className={b.blankFace} /> : face(back)}
                  </div>
                </div>
              );
            })}
          </div>
          <nav className={b.controls} aria-label="تقليب الصفحات">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={flipped === 0}
            >
              → السابقة
            </button>
            <button type="button" onClick={() => go(1)}>
              الفهرس
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={flipped >= last}
            >
              التالية ←
            </button>
          </nav>
          <p className={b.where} aria-live="polite" ref={live} />
        </section>
      )}
    </div>
  );
}

function PageFace({
  page,
  index,
  version,
  go,
  flat = false,
}: {
  page: Page;
  index: number;
  version: string;
  go: (to: number, hash?: string) => void;
  flat?: boolean;
}) {
  if (page.kind === "cover")
    return (
      <div className={b.cover}>
        <p className={b.coverEyebrow}>أكلات جدتنا</p>
        {/* biome-ignore lint/performance/noImgElement: صورة الشعار الثابتة على الغلاف */}
        <img
          src="/brand/jdatna-main.webp"
          alt=""
          width={160}
          height={200}
          className={b.coverLogo}
        />
        <p className={b.coverTitle}>دليل المستخدم</p>
        <p className={b.coverLead}>
          كل ما تحتاجه لتطلب وتطبخ وتشترك، خطوة بخطوة
        </p>
        <p className={b.coverVersion}>الإصدار {version}</p>
        {!flat && (
          <button type="button" className={b.openButton} onClick={() => go(1)}>
            افتح الكتاب ←
          </button>
        )}
      </div>
    );
  if (page.kind === "back")
    return (
      <div className={`${b.cover} ${b.backCover}`}>
        <p className={b.coverTitle}>شكرًا لك</p>
        <p className={b.coverLead}>أكل بيت من أسر بلدك، بيد جدتنا وطعمها.</p>
        <p>
          <Link href="/" className={b.coverLink}>
            إلى الصفحة الرئيسية
          </Link>
        </p>
        {!flat && (
          <button type="button" className={b.openButton} onClick={() => go(1)}>
            العودة للفهرس
          </button>
        )}
      </div>
    );
  if (page.kind === "blank")
    return (
      <div className={b.paper}>
        <p className={b.notes}>ملاحظاتك</p>
      </div>
    );
  if (page.kind === "toc")
    return (
      <div className={b.paper}>
        <h2 className={b.tocTitle} id="guide-toc">
          الفهرس
        </h2>
        <ol className={b.toc} aria-labelledby="guide-toc">
          {GUIDE_CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (flat)
                    document
                      .getElementById(`guide-${c.id}`)
                      ?.scrollIntoView({ behavior: "smooth" });
                  else go(chapterPage(c.id), `#${c.id}`);
                }}
              >
                <span className={`${b.tocDot} ${b[c.tone]}`} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={b.tocName}>{c.title}</span>
                <span className={b.tocFill} aria-hidden="true" />
                <span className={b.tocPage}>
                  <span className="sr-only">صفحة </span>
                  {chapterPage(c.id)}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    );
  const c = page.chapter;
  return (
    <article
      className={b.paper}
      aria-labelledby={`guide-${c.id}`}
      data-chapter={c.id}
    >
      <header className={`${b.band} ${b[c.tone]}`}>
        <span className={b.chapterNo}>الفصل {page.number}</span>
        <span className={b.audience}>{c.audience}</span>
      </header>
      <h2 id={`guide-${c.id}`} className={b.chapterTitle}>
        {c.title}
      </h2>
      <div className={b.art}>
        <GuideArt name={c.art} />
      </div>
      <p className={b.intro}>{c.intro}</p>
      <ol className={b.steps}>
        {c.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {c.tip && (
        <p className={b.tip}>
          <strong>نصيحة: </strong>
          {c.tip}
        </p>
      )}
      {c.links && (
        <p className={b.links}>
          {c.links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label} ←
            </Link>
          ))}
        </p>
      )}
      <footer className={b.folio} aria-hidden="true">
        {index}
      </footer>
    </article>
  );
}
