"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, s as forms, useSession } from "@/components/forms/shared";
import { SectionIcon } from "@/components/forms/section-icon";
import { prefetchAdmin } from "@/components/forms/admin-cache";
import { can, isManager } from "@/lib/permissions";
import { currentLabel, visibleGroups } from "@/lib/admin-nav";
import css from "./admin-frame.module.css";

/** يُطلق بعد قرار اعتماد، فيتحدّث عدد «تنتظر الاعتماد» في القائمة. */
export const APPROVALS_CHANGED = "jdatna:approvals-changed";
const POLL_MS = 60_000;

/**
 * إطار «لوحة الإدارة» (مثل «أي خدمة»، AdminLayout): قائمة جانبية في جهة بداية القراءة (يمين)،
 * ورأس فيه اسم القسم الحالي، بلا ترويسة الموقع وتذييله. على الجوال تُفتح القائمة بزر ☰.
 * الجلسة هنا جلسة اللوحة وحدها (12 ساعة)، والخروج منها يعيد للحساب الشخصي في الموقع.
 */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const user = session.user;
  const path = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const reviews = can(user, "producers");

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      setPending(
        (await api<{ count: number }>("/api/admin/producers/pending")).count,
      );
    } catch {
      // انقطاع مؤقت: نعيد المحاولة في الدورة التالية.
    }
  }, []);
  useEffect(() => {
    if (!reviews) return;
    check();
    const timer = window.setInterval(check, POLL_MS);
    window.addEventListener(APPROVALS_CHANGED, check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(APPROVALS_CHANGED, check);
    };
  }, [reviews, check]);
  // تغيّر الصفحة يغلق قائمة الجوال، وEsc يغلقها.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  if (!session.ready)
    return (
      <p role="status" className={css.waiting}>
        جارٍ فتح لوحة الإدارة…
      </p>
    );
  if (!user) return <EnterAdmin error={session.error} />;
  if (!isManager(user))
    return (
      <section className={css.enter}>
        <h1>لوحة الإدارة</h1>
        <p role="alert" className={forms.error}>
          هذه الصفحة مخصصة للإدارة. ليست لديك صلاحية الوصول.
        </p>
        <a href="/" className={forms.buttonSecondary}>
          الرجوع للموقع
        </a>
      </section>
    );

  async function leave() {
    setLeaving(true);
    try {
      await api("/api/logout", { method: "POST" });
    } finally {
      // تحميل كامل: الموقع يعود بالجلسة الشخصية وحدها.
      window.location.assign("/");
    }
  }
  const groups = visibleGroups(user);
  return (
    <div className={css.frame}>
      <aside
        id="admin-menu"
        className={`${css.side} ${open ? css.sideOpen : ""}`}
        aria-label="أقسام الإدارة"
      >
        <div className={css.sideHead}>
          <Link href="/admin" className={css.brand}>
            أكلات جدتنا
            <small>لوحة الإدارة</small>
          </Link>
          <button
            type="button"
            className={css.close}
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
          >
            ×
          </button>
        </div>
        <nav className={css.nav}>
          {groups.map((g, i) => (
            <div
              key={g.label}
              role="group"
              aria-labelledby={`admin-group-${i}`}
            >
              <p id={`admin-group-${i}`} className={css.groupTitle}>
                {g.label}
              </p>
              {g.items.map((it) => {
                const active = it.end
                  ? path === it.to
                  : path === it.to || path.startsWith(it.to + "/");
                return (
                  <Link
                    key={it.to}
                    href={it.to}
                    className={`${css.item} ${active ? css.itemActive : ""}`}
                    aria-current={active ? "page" : undefined}
                    onPointerEnter={() => prefetchAdmin(it.data ?? [])}
                    onFocus={() => prefetchAdmin(it.data ?? [])}
                  >
                    <SectionIcon name={it.icon} />
                    <span>{it.labelKey}</span>
                    {it.to === "/admin/approvals" && pending > 0 && (
                      <span className={css.badge}>
                        {pending}
                        <span className="sr-only"> تنتظر الاعتماد</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={css.sideFoot}>
          <p className={css.who}>
            <strong>{user.name}</strong>
            <small>{user.role === "admin" ? "مدير كامل" : "مشرف"}</small>
          </p>
          <div className={css.footActions}>
            {/* رابط عادي (تحميل كامل): الموقع بالجلسة الشخصية، ولوحة الإدارة تبقى مفتوحة 12 ساعة. */}
            <a href="/" className={css.footLink}>
              الموقع
            </a>
            <button
              type="button"
              className={css.footLeave}
              onClick={leave}
              disabled={leaving}
            >
              {leaving ? "جارٍ الخروج…" : "خروج من اللوحة"}
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button
          type="button"
          className={css.shade}
          aria-label="إغلاق القائمة"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <div className={css.body}>
        <header className={css.top}>
          <button
            type="button"
            className={css.menuButton}
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls="admin-menu"
            aria-label="أقسام الإدارة"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className={css.title}>
            <small>لوحة الإدارة</small>
            <strong>{currentLabel(path)}</strong>
          </div>
        </header>
        <div className={css.work}>{children}</div>
      </div>
    </div>
  );
}

/** بلا جلسة لوحة: ضغطة واحدة تفتحها من الحساب الشخصي، ولا يُطلب الدخول مرة أخرى. */
function EnterAdmin({ error }: { error: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(error);
  const [needLogin, setNeedLogin] = useState(false);
  async function enter() {
    setBusy(true);
    setProblem("");
    try {
      await api("/api/auth/admin-session", { method: "POST" });
      window.location.reload();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setNeedLogin(status === 401);
      setProblem((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className={css.enter} aria-labelledby="enter-title">
      <h1 id="enter-title">لوحة الإدارة</h1>
      <p>
        لوحة الإدارة منفصلة عن حسابك الشخصي، وتبقى مفتوحة 12 ساعة في هذا الجهاز.
      </p>
      {problem && (
        <p role="alert" className={forms.error}>
          {problem}
        </p>
      )}
      {needLogin ? (
        <Link href="/login" className={forms.button}>
          تسجيل الدخول
        </Link>
      ) : (
        <button
          type="button"
          className={forms.button}
          onClick={enter}
          disabled={busy}
        >
          {busy ? "جارٍ الفتح…" : "افتح لوحة الإدارة"}
        </button>
      )}
      <a href="/" className={forms.buttonSecondary}>
        الرجوع للموقع
      </a>
    </section>
  );
}
