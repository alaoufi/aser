"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GuideArt } from "./guide-art";
import { GUIDE_CHAPTERS, type GuideChapter } from "./guide-content";
import b from "./guide-book.module.css";
import { safeDecode } from "@/lib/digits";

type Page =
  | { kind: "cover" }
  | { kind: "toc" }
  | { kind: "chapter"; chapter: GuideChapter; number: number }
  | { kind: "blank" }
  | { kind: "back" };

/** صفحات الكتاب من فصوله: غلاف، فهرس، الفصول، ثم الغلاف الخلفي. */
function buildPages(chapters: GuideChapter[]): Page[] {
  const pages: Page[] = [
    { kind: "cover" },
    { kind: "toc" },
    ...chapters.map((chapter, i) => ({
      kind: "chapter" as const,
      chapter,
      number: i + 1,
    })),
  ];
  // الغلاف الخلفي على ظهر آخر ورقة: عدد الصفحات زوجي دائمًا.
  if (pages.length % 2 === 0) pages.push({ kind: "blank" });
  pages.push({ kind: "back" });
  return pages;
}
const chapterIndex = (pages: Page[], id: string) =>
  pages.findIndex((p) => p.kind === "chapter" && p.chapter.id === id);

/** نصوص الغلافين واسم الكتاب؛ الافتراضي دليل المستخدم. */
export type GuideCopy = {
  label: string;
  title: string;
  lead: string;
  backTitle: string;
  backLead: string;
  backLink?: { href: string; label: string };
};
const USER_GUIDE: GuideCopy = {
  label: "دليل المستخدم",
  title: "دليل المستخدم",
  lead: "كل ما تحتاجه لتطلب وتطبخ وتشترك، خطوة بخطوة",
  backTitle: "شكرًا لك",
  backLead: "أكل بيت من أسر بلدك، بيد جدتنا وطعمها.",
  backLink: { href: "/", label: "إلى الصفحة الرئيسية" },
};

/**
 * دليل المستخدم على هيئة كتاب ثلاثي الأبعاد يُقلَّب من اليمين إلى اليسار كالكتاب العربي:
 * صفحتان متقابلتان على الشاشة الواسعة، وصفحة واحدة على الجوال. النص كله في الصفحة
 * (لمحركات البحث وقارئ الشاشة)، والصفحات المطوية خاملة (inert) حتى تُفتح.
 */
export function GuideBook({
  version,
  chapters = GUIDE_CHAPTERS,
  copy = USER_GUIDE,
  hash = true,
}: {
  version: string;
  /** فصول الكتاب؛ الافتراضي دليل المستخدم كاملًا. */
  chapters?: GuideChapter[];
  copy?: GuideCopy;
  /** ربط الفصل بعنوان الصفحة (#) — يُعطَّل للكتاب المضمَّن داخل صفحة أخرى. */
  hash?: boolean;
}) {
  const pages = useMemo(() => buildPages(chapters), [chapters]);
  const chapterPage = useCallback(
    (id: string) => chapterIndex(pages, id),
    [pages],
  );
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
    const fromHash = hash
      ? chapterPage(safeDecode(location.hash.slice(1)))
      : -1;
    if (fromHash > 0) setPage(fromHash);
    return () => q.removeEventListener("change", sync);
  }, [hash, chapterPage]);

  // المزدوج: عدد الأوراق المقلوبة f يُظهر الصفحتين 2f-1 (يمين) و2f (يسار).
  const flipped = narrow ? page : Math.floor((page + 1) / 2);
  const leaves = narrow ? pages.length : pages.length / 2;
  const last = leaves - (narrow ? 1 : 0);
  const visible = narrow ? [page] : [flipped * 2 - 1, flipped * 2];

  const go = useCallback(
    (to: number, target?: string) => {
      const index = Math.max(0, Math.min(pages.length - 1, to));
      setPage(index);
      if (!hash) return;
      const p = pages[index];
      history.replaceState(
        null,
        "",
        target ??
          (p.kind === "chapter" ? `#${p.chapter.id}` : location.pathname),
      );
    },
    [pages, hash],
  );
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
    return (
      <PageFace
        page={p}
        index={index}
        version={version}
        go={go}
        chapters={chapters}
        chapterPage={chapterPage}
        copy={copy}
      />
    );
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
                <PageFace
                  page={p}
                  index={i}
                  version={version}
                  go={go}
                  chapters={chapters}
                  chapterPage={chapterPage}
                  copy={copy}
                  flat
                />
              </section>
            ),
          )}
        </div>
      ) : (
        <section
          className={b.stage}
          aria-roledescription="كتاب"
          aria-label={copy.label}
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
  chapters,
  chapterPage,
  copy,
  flat = false,
}: {
  page: Page;
  index: number;
  version: string;
  go: (to: number, hash?: string) => void;
  chapters: GuideChapter[];
  chapterPage: (id: string) => number;
  copy: GuideCopy;
  flat?: boolean;
}) {
  if (page.kind === "cover")
    return (
      <div className={b.cover}>
        <p className={b.coverEyebrow}>أكلات جدتنا</p>
        {/* biome-ignore lint/performance/noImgElement: صورة الشعار الثابتة على الغلاف */}
        <img
          src="/brand/jdatna-main-264.webp"
          alt=""
          width={160}
          height={200}
          className={b.coverLogo}
        />
        <p className={b.coverTitle}>{copy.title}</p>
        <p className={b.coverLead}>{copy.lead}</p>
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
        <p className={b.coverTitle}>{copy.backTitle}</p>
        <p className={b.coverLead}>{copy.backLead}</p>
        {copy.backLink && (
          <p>
            <Link href={copy.backLink.href} className={b.coverLink}>
              {copy.backLink.label}
            </Link>
          </p>
        )}
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
          {chapters.map((c, i) => (
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
      {c.image ? (
        // biome-ignore lint/performance/noImgElement: لقطة شاشة ثابتة توضّح الخطوة
        <img
          className={b.shot}
          src={c.image.src}
          alt={c.image.alt}
          width={c.image.width}
          height={c.image.height}
          loading="lazy"
        />
      ) : (
        <div className={b.art}>
          <GuideArt name={c.art} />
        </div>
      )}
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
