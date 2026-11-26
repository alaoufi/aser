"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/types";
import s from "./account.module.css";
import { isManager } from "@/lib/permissions";
import { LogoutButton } from "@/components/public/logout-button";
import { PasswordField } from "./password-field";
import { FolderTabs, type FolderTab } from "./folder-tabs";
export { s };
export * from "./session";
import {
  accountKind,
  api,
  familyPending,
  isFamilyAccount,
  MemberNo,
  primeSession,
  useSession,
  useSiteTexts,
} from "./session";
export function Message({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return (
    <>
      {error && (
        <div ref={ref} tabIndex={-1} role="alert" className={s.error}>
          {error}
        </div>
      )}
      {success && (
        <p role="status" className={s.notice}>
          {success}
        </p>
      )}
    </>
  );
}
function AccountNavigation() {
  const { user } = useSession();
  const path = usePathname();
  if (!user) return null;
  // حساب أسرة: دوره أسرة منتجة، أو المدير الكامل الذي له ملف أسرة.
  const family = isFamilyAccount(user);
  const pending = familyPending(user);
  const links: [string, string][] = [
    ["/", "الرئيسية"],
    ["/orders", "طلباتي"],
    ["/messages", "المحادثات"],
    ["/directory", "دليلي"],
    ...((user.role === "courier" || pending
      ? []
      : [["/requests", family ? "طلبات العملاء" : "اطلب من الأسر"]]) as [
      string,
      string,
    ][]),
    ["/my-subscriptions", "اشتراكاتي"],
    ["/me", "معلوماتي"],
    ...((user.role === "courier"
      ? [["/courier", "لوحتي كمندوب"]]
      : family
        ? // أقسام الأسرة في «لوحتي» بمربعات، و«مندوبي الخاص» ظاهر في القائمة أيضًا.
          [
            ["/dashboard", "لوحتي"],
            ...(pending ? [] : [["/dashboard/couriers", "مندوبي الخاص"]]),
          ]
        : [
            ["/offers", "العروض الخاصة"],
            // «تجمع المندوبين»: يختار العميل مندوبًا إن لم يتفق مع الأسرة على التوصيل.
            ["/couriers", "المندوبين"],
            // المدير الكامل حسابه الخاص يكون طالب خدمة أو أسرة.
            user.role === "admin"
              ? ["/dashboard", "لوحتي كأسرة"]
              : ["/register", "طلب انضمام كأسرة"],
          ]) as [string, string][]),
  ];
  // صاحب الحساب واضح لا مجهول: اسم الأسرة (الاسم التجاري) للأسرة، واسمه لغيرها، ونوع الحساب تحته.
  const shown = user.familyName || user.name;
  return (
    <>
      <div className={s.greeting}>
        <MemberNo no={user.memberNo} />
        <p>
          مرحبًا، <strong>{shown}</strong>
        </p>
        <p className={s.greetingRole}>{accountKind(user)}</p>
      </div>
      {/* روابط بارزة كأزرار، والصفحة الحالية مميزة بلونها. */}
      <AccountLinks links={links} path={path} />
    </>
  );
}
/**
 * قائمة «حسابي» منسدلة: زر واحد يحمل اسم الصفحة الحالية، وتحته الروابط و«خروج».
 * تُغلق عند اختيار رابط أو الضغط خارجها أو زر Esc.
 */
function AccountLinks({
  links,
  path,
}: {
  links: [string, string][];
  path: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const current =
    links.find(([href]) => href === path)?.[1] ??
    links.find(([href]) => href !== "/" && path.startsWith(`${href}/`))?.[1];
  // اختيار صفحة (بالفأرة أو لوحة المفاتيح) يغلق القائمة.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      const d = menu.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        d.open = false;
        d.querySelector("summary")?.focus();
        return;
      }
      if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <nav aria-label="حسابي" className={s.nav}>
      <details className={s.accountMenu} ref={menu}>
        <summary className={s.accountMenuButton}>
          <span aria-hidden="true">☰</span> قائمة حسابي
          {current && <span className={s.accountMenuCurrent}>{current}</span>}
        </summary>
        <div className={s.accountMenuList}>
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={s.navLink}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <LogoutButton className={`${s.navLink} ${s.navLogout}`} />
        </div>
      </details>
    </nav>
  );
}
/** أقسام لوحة الأسرة: تبويبات ثلاثية الأبعاد أعلى كل صفحة من صفحات اللوحة. */
export const FAMILY_TABS: FolderTab[] = [
  { id: "home", label: "الرئيسية", href: "/dashboard" },
  { id: "products", label: "المنتجات", href: "/dashboard/products" },
  { id: "orders", label: "الطلبات", href: "/dashboard/orders" },
  { id: "offers", label: "العروض", href: "/dashboard/offers" },
  {
    id: "subscriptions",
    label: "الاشتراكات",
    href: "/dashboard/subscriptions",
  },
  { id: "library", label: "مكتبة الصور", href: "/dashboard/library" },
  { id: "views", label: "المشاهدات", href: "/dashboard/views" },
  // «مائدتي»: اسمها من «نصوص الموقع» (maeda.tab) في FamilyTabs.
  { id: "maeda", label: "", href: "/dashboard/maeda" },
  { id: "coverage", label: "التغطية", href: "/dashboard/coverage" },
  // مندوب الأسرة الخاص: تسجّله بنفسها بتعهّد، دون اعتماد الإدارة.
  { id: "couriers", label: "مندوبي الخاص", href: "/dashboard/couriers" },
];
function FamilyTabs({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const { tx } = useSiteTexts();
  const path = usePathname();
  const tab = FAMILY_TABS.find((t) => t.href === path);
  if (!user || !isFamilyAccount(user) || !tab) return <>{children}</>;
  return (
    <FolderTabs
      label="أقسام الأسرة المنتجة"
      tabs={(familyPending(user)
        ? FAMILY_TABS.filter((t) => t.id !== "couriers")
        : FAMILY_TABS
      ).map((t) => (t.id === "maeda" ? { ...t, label: tx("maeda.tab") } : t))}
      active={tab.id}
    >
      {children}
    </FolderTabs>
  );
}
export function AccountShell({
  children,
  navigation = true,
  compact = false,
}: {
  children: React.ReactNode;
  navigation?: boolean;
  /** بلا هوامش علوية كبيرة (صفحة المحادثات) لتوفير المساحة. */
  compact?: boolean;
}) {
  return (
    <section className={`${s.shell}${compact ? ` ${s.shellCompact}` : ""}`}>
      {navigation && <AccountNavigation />}
      {navigation ? <FamilyTabs>{children}</FamilyTabs> : children}
    </section>
  );
}
export function Guard({
  ready,
  user,
  error,
  admin = false,
}: {
  ready: boolean;
  user: SessionUser | null;
  error: string;
  admin?: boolean;
}) {
  if (!ready) return <p role="status">جارٍ التحقق من الحساب…</p>;
  if (error) return <Message error={error} />;
  if (!user)
    return (
      <p className={s.notice}>
        يلزم <Link href="/login">تسجيل الدخول</Link> للمتابعة.
      </p>
    );
  if (admin && !isManager(user))
    return (
      <p role="alert" className={s.error}>
        هذه الصفحة مخصصة للإدارة. ليست لديك صلاحية الوصول.
      </p>
    );
  return null;
}
export function LoginForm({
  register = false,
  onVerified,
}: {
  register?: boolean;
  onVerified?: (user: SessionUser) => void;
}) {
  const session = useSession();
  const [mode, setMode] = useState<"password" | "signup" | "recover">(
    "password",
  );
  const [intent, setIntent] = useState("customer");
  const [challenge, setChallenge] = useState("");
  const [adminChallenge, setAdminChallenge] = useState("");
  const [verified, setVerified] = useState<SessionUser | null>(null);
  const [canSetCredentials, setCanSetCredentials] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  // إعادة إرسال الرمز بعد دقيقة من آخر إرسال.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  // رابط الدعوة (jdtna.sa/r/رقم العضو) يفتح «حساب جديد» مباشرة، ويملأ «رقم الدعوة» برقم من دعاه.
  const [invited, setInvited] = useState("");
  useEffect(() => {
    if (register) return;
    if (new URLSearchParams(window.location.search).get("signup") === "1")
      setMode("signup");
    setInvited(
      /(?:^|;\s*)jdatna_ref=(\d{1,7})/.exec(document.cookie)?.[1] ?? "",
    );
  }, [register]);
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ challengeId: string }>("/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({
          phone,
          purpose: mode === "signup" ? "signup" : "reset",
        }),
      });
      setChallenge(d.challengeId);
      setResendIn(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [username, setUsername] = useState("");
  const [clearUsername, setClearUsername] = useState(false);
  // تجاوز حد محاولات الدخول (قرار المالك 2026-11-25): اسم الدخول المكتوب، لزر «استعادة كلمة المرور».
  const [limited, setLimited] = useState("");
  const { tx, txb } = useSiteTexts();
  // رسالة منبثقة واضحة عند تجاوز الحد (طلب المالك 2026-11-25)، تبقى بعد إغلاقها رسالةً وزرًا في الصفحة.
  const limitDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = limitDialog.current;
    if (!el) return;
    if (limited && !el.open) el.showModal?.();
    if (!limited && el.open) el.close();
  }, [limited]);
  /** «لاستعادة كلمة المرور اضغط هنا»: إن كان اسم الدخول جوالًا يُرسل الرمز إليه مباشرة. */
  async function recoverNow() {
    const id = limited.trim();
    const isPhone = /^[+0-9٠-٩۰-۹\s-]{9,}$/.test(id);
    switchMode("recover");
    if (!isPhone) return;
    setPhone(id);
    setBusy(true);
    try {
      const d = await api<{ challengeId: string }>("/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone: id, purpose: "reset" }),
      });
      setChallenge(d.challengeId);
      setResendIn(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function switchMode(next: typeof mode) {
    setMode(next);
    setLimited("");
    setChallenge("");
    setAdminChallenge("");
    setVerified(null);
    setCanSetCredentials(false);
    setError("");
    setUsername("");
    setClearUsername(false);
  }
  function finish(user: SessionUser, next?: string) {
    if (onVerified) {
      onVerified(user);
      return;
    }
    const destination =
      user.role === "admin"
        ? "/admin"
        : user.role === "producer"
          ? "/dashboard"
          : user.role === "courier"
            ? "/courier"
            : "/orders";
    if (mode === "signup" && intent === "family" && user.role === "customer") {
      window.location.assign("/register");
      return;
    }
    if (mode === "signup" && intent === "courier" && user.role === "customer") {
      window.location.assign("/courier");
      return;
    }
    // الصفحة التالية تعرض الحساب فورًا دون انتظار فحص الجلسة.
    primeSession(user);
    window.location.assign(next === destination ? next : destination);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLimited("");
    const f = new FormData(e.currentTarget);
    try {
      if (verified) {
        if (!canSetCredentials)
          throw new Error("أعد التحقق من الجوال لتعيين كلمة المرور");
        const password = String(f.get("password") ?? "");
        if (password !== f.get("confirmPassword"))
          throw new Error("كلمتا المرور غير متطابقتين");
        const payload: { password: string; username?: string | null } = {
          password,
        };
        if (clearUsername) payload.username = null;
        else if (username.trim()) payload.username = username.trim();
        const d = await api<{ user: SessionUser; next: string }>(
          "/api/auth/credentials",
          { method: "POST", body: JSON.stringify(payload) },
        );
        finish(d.user, d.next);
      } else if (mode === "password" && adminChallenge) {
        const d = await api<{ user: SessionUser; next: string }>(
          "/api/auth/admin-verify",
          {
            method: "POST",
            body: JSON.stringify({
              challengeId: adminChallenge,
              code: String(f.get("adminCode") ?? ""),
            }),
          },
        );
        finish(d.user, d.next);
      } else if (mode === "password") {
        const d = await api<{
          user: SessionUser;
          next: string;
          otpRequired?: boolean;
          challengeId?: string;
        }>("/api/auth/password-login", {
          method: "POST",
          body: JSON.stringify({
            identifier: String(f.get("identifier") ?? "").trim(),
            password: f.get("password"),
          }),
        });
        if (d.otpRequired && d.challengeId) {
          setAdminChallenge(d.challengeId);
          return;
        }
        finish(d.user, d.next);
      } else if (!challenge) {
        const d = await api<{ challengeId: string }>("/api/auth/request-otp", {
          method: "POST",
          body: JSON.stringify({
            phone,
            purpose: mode === "signup" ? "signup" : "reset",
          }),
        });
        setChallenge(d.challengeId);
        setResendIn(60);
      } else {
        const d = await api<{
          user: SessionUser;
          next: string;
          canSetCredentials: boolean;
        }>("/api/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({
            challengeId: challenge,
            code: f.get("code"),
            purpose: mode === "signup" ? "signup" : "reset",
            ...(mode === "signup"
              ? {
                  name: f.get("name"),
                  ...(String(f.get("invite") ?? "").trim()
                    ? { invite: String(f.get("invite")).trim() }
                    : {}),
                }
              : {}),
          }),
        });
        if (!d.canSetCredentials)
          throw new Error(
            "تعذر اعتماد إذن إعداد كلمة المرور؛ أعد التحقق من الجوال",
          );
        setVerified(d.user);
        setCanSetCredentials(d.canSetCredentials === true);
        setUsername(
          (d.user as SessionUser & { username?: string | null }).username ?? "",
        );
      }
    } catch (e) {
      const limit =
        mode === "password" &&
        Boolean((e as { data?: { limit?: boolean } }).data?.limit);
      // رسالة الحد من «نصوص الموقع»، وغيرها كما يرسلها الخادم.
      setError(limit ? txb("login.limitTitle") : (e as Error).message);
      if (limit) setLimited(String(f.get("identifier") ?? ""));
    } finally {
      setBusy(false);
    }
  }
  if (!session.ready) return <p role="status">جارٍ التحقق من الحساب…</p>;
  if (session.user && !verified) {
    const destination =
      session.user.role === "admin"
        ? "/admin"
        : session.user.role === "producer"
          ? "/dashboard"
          : session.user.role === "courier"
            ? "/courier"
            : "/orders";
    return (
      <section className={s.card}>
        <h1>أهلًا {session.user.name}</h1>
        <p>أنت مسجل الدخول بالفعل.</p>
        <Link className={s.button} href={destination}>
          متابعة إلى حسابي
        </Link>
      </section>
    );
  }
  return (
    <section
      className={s.card}
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h1>
        {verified
          ? "إعداد بيانات الدخول"
          : mode === "password"
            ? "الدخول إلى أكلات جدتنا"
            : mode === "signup"
              ? "حساب جديد في أكلات جدتنا"
              : "نسيت كلمة المرور"}
      </h1>
      <p className={s.muted}>
        {verified
          ? "تحققنا من جوالك لإعداد كلمة المرور. احفظ كلمة مرور خلال عشر دقائق لإكمال الدخول. اسم المستخدم اختياري."
          : mode === "password"
            ? "ادخل باسم المستخدم أو جوالك المتحقق منه وكلمة المرور. نفتح حسابك بحسب صلاحياته المعتمدة."
            : mode === "recover"
              ? "نرسل رمزًا إلى الجوال المسجل لاستعادة كلمة المرور. إذا لم تعيّن كلمة مرور لحسابك سابقًا، يمكنك إعدادها بهذه الخطوة مرة واحدة."
              : "نرسل رمزًا من ستة أرقام لإنشاء حسابك لأول مرة، ثم تعيّن كلمة مرور للدخول. لا تشارك الرمز مع أي شخص."}
      </p>
      {register && (
        <p className={s.notice}>
          بعد الدخول يمكنك استكمال طلب الأسرة المنتجة؛ يخضع الاعتماد لمراجعة
          الإدارة.
        </p>
      )}
      <Message error={error || session.error} />
      <dialog
        ref={limitDialog}
        className="order-alert login-limit"
        aria-labelledby="login-limit-title"
        aria-describedby="login-limit-text"
        onCancel={(event) => {
          event.preventDefault();
          limitDialog.current?.close();
        }}
      >
        <div className="order-alert-head">
          <span className="order-alert-mark" aria-hidden="true" />
          <h2 id="login-limit-title">{txb("login.limitTitle")}</h2>
        </div>
        <p id="login-limit-text" className="login-limit-text">
          {tx("login.limitBody")}
        </p>
        <div className="order-alert-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => {
              limitDialog.current?.close();
              recoverNow();
            }}
          >
            {txb("login.limitRecover")}
          </button>
          <button
            type="button"
            className="button light"
            onClick={() => limitDialog.current?.close()}
          >
            {txb("login.limitClose")}
          </button>
        </div>
      </dialog>
      {limited && mode === "password" && (
        <button
          type="button"
          className={s.button}
          style={{ marginBottom: 12 }}
          disabled={busy}
          onClick={recoverNow}
        >
          {txb("login.limitRecover")}
        </button>
      )}
      {mode !== "password" && !verified && session.ready && !session.open && (
        <p role="status" className={s.notice}>
          التسجيل والتحقق برقم الجوال غير متاحين حاليًا حتى اكتمال جاهزية
          الخدمات. الدخول بكلمة المرور متاح للحسابات التي أعدتها مسبقًا.
        </p>
      )}
      <form
        className={s.form}
        onSubmit={submit}
        key={verified ? "credentials" : mode}
      >
        {verified ? (
          <>
            <label className={s.field}>
              اسم مستخدم اختياري
              <input
                name="username"
                aria-label="اسم مستخدم اختياري"
                dir="ltr"
                autoComplete="username"
                minLength={3}
                maxLength={40}
                value={username}
                disabled={clearUsername}
                onChange={(e) => setUsername(e.target.value)}
              />
              <small>
                حروف وأرقام ونقطة وشرطة فقط. يمكنك الدخول برقم جوالك دون اسم
                مخصص.
              </small>
            </label>
            {(verified as SessionUser & { username?: string | null })
              .username && (
              <div className={s.checks}>
                <label>
                  <input
                    type="checkbox"
                    checked={clearUsername}
                    onChange={(e) => setClearUsername(e.target.checked)}
                  />
                  إلغاء اسم المستخدم المخصص واستخدام الجوال
                </label>
              </div>
            )}
            <PasswordField
              label="كلمة المرور الجديدة"
              name="password"
              autoComplete="new-password"
              minLength={4}
              required
              hint="أربع خانات على الأقل؛ أحرف أو أرقام أو رموز، دون اشتراط خلطها."
            />
            <PasswordField
              label="تأكيد كلمة المرور"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={4}
              required
            />
            <button className={s.button} disabled={busy}>
              حفظ بيانات الدخول
            </button>
          </>
        ) : mode === "password" && adminChallenge ? (
          <>
            <p className={s.notice} role="status">
              حساب إدارة: أرسلنا رمز دخول إلى جوالك المسجل. أدخله لإكمال الدخول.
            </p>
            <label className={s.field}>
              رمز دخول الإدارة
              <input
                name="adminCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9٠-٩۰-۹]{4,6}"
                minLength={4}
                maxLength={6}
                required
                autoFocus
              />
            </label>
            <button className={s.button} disabled={busy}>
              {busy ? "جارٍ التحقق…" : "تأكيد الدخول"}
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => setAdminChallenge("")}
            >
              رجوع
            </button>
          </>
        ) : mode === "password" ? (
          <>
            <label className={s.field}>
              اسم المستخدم أو رقم الجوال
              <input
                name="identifier"
                dir="ltr"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={100}
              />
            </label>
            <PasswordField
              label="كلمة المرور"
              name="password"
              autoComplete="current-password"
              required
            />
            <button className={s.button} disabled={busy || !session.ready}>
              {busy ? "جارٍ الدخول…" : "دخول"}
            </button>
          </>
        ) : (
          <>
            {mode === "signup" && !challenge && (
              <label className={s.field}>
                <span className="sr-only">نوع الحساب المطلوب</span>
                <select
                  aria-label="نوع الحساب المطلوب"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                >
                  <option value="" disabled>
                    نوع الحساب المطلوب
                  </option>
                  <option value="customer">عميل</option>
                  <option value="family">أسرة منتجة — تقديم طلب أهلية</option>
                  <option value="courier">مندوب توصيل للأسر المنتجة</option>
                </select>
              </label>
            )}
            {mode === "signup" && !challenge && (
              <p className={s.muted} data-testid="account-type-hint">
                {intent === "family"
                  ? "الأسرة المنتجة: بعد التحقق من الجوال ترفع التراخيص المطلوبة، ولا تظهر منتجاتها إلا بعد موافقة الإدارة."
                  : intent === "courier"
                    ? "المندوب: بعد التحقق من الجوال يُكمل بياناته (رقم الهوية وصورتها ونوع السيارة)، ويظهر للأسر المنتجة بعد موافقة الإدارة."
                    : "العميل: يتفعّل حسابه مباشرة بعد التحقق من الجوال."}{" "}
                التصفح متاح للجميع، والطلب بعد التسجيل والتحقق من الجوال.
              </p>
            )}
            {mode === "signup" && challenge && (
              <label className={s.field}>
                رقم الدعوة (اختياري)
                <input
                  name="invite"
                  key={invited}
                  defaultValue={invited}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="رقم العضو الذي دعاك أو جواله"
                  maxLength={30}
                />
              </label>
            )}
            {mode === "signup" && challenge && (
              <label className={s.field}>
                اسم صاحب الحساب
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
            )}
            <label className={s.field}>
              رقم الجوال
              <input
                type="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder="05xxxxxxxx"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={!!challenge}
              />
            </label>
            {challenge && (
              <label className={s.field}>
                رمز التحقق
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9٠-٩۰-۹]{4,6}"
                  minLength={4}
                  maxLength={6}
                  required
                  autoFocus
                />
              </label>
            )}
            <button
              className={s.button}
              disabled={busy || !session.ready || !session.open}
            >
              {busy
                ? "جارٍ المتابعة…"
                : challenge
                  ? "تحقق ومتابعة"
                  : "أرسل رمز التحقق"}
            </button>
            {challenge && (
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.buttonSecondary}
                  disabled={busy || resendIn > 0}
                  onClick={resend}
                >
                  {resendIn > 0
                    ? `إعادة إرسال الرمز بعد ${resendIn} ثانية`
                    : "إعادة إرسال الرمز"}
                </button>
                <button
                  type="button"
                  className={s.button}
                  disabled={busy}
                  onClick={() => setChallenge("")}
                >
                  تغيير الرقم
                </button>
              </div>
            )}
          </>
        )}
      </form>
      {!verified && (
        <div className={s.actions} style={{ marginTop: 20 }}>
          {mode !== "password" && (
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={() => switchMode("password")}
            >
              الدخول بكلمة المرور
            </button>
          )}
          {mode !== "signup" && (
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={() => switchMode("signup")}
            >
              إنشاء حساب جديد
            </button>
          )}
          {mode !== "recover" && (
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={() => switchMode("recover")}
            >
              نسيت كلمة المرور
            </button>
          )}
        </div>
      )}
      {verified && (
        <button
          type="button"
          className={s.button}
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => switchMode("recover")}
        >
          إعادة التحقق من الجوال
        </button>
      )}
    </section>
  );
}
