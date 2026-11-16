"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/types";
import s from "./account.module.css";
import { isManager } from "@/lib/permissions";
import { LogoutButton } from "@/components/public/logout-button";
import { PasswordField } from "./password-field";
import { FolderTabs, type FolderTab } from "./folder-tabs";
export { s };
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    // البيانات مع الخطأ: الخادم قد يطلب تأكيدًا (confirm) قبل إجراء له أثر.
    throw Object.assign(
      new Error(data.error || "تعذر إتمام الطلب. يرجى المحاولة مجددًا."),
      { status: r.status, data },
    );
  announceSaved(url, options?.method);
  return data as T;
}
/** يُبث بعد كل حفظ ناجح لتظهر رسالة «تم الحفظ» أسفل الشاشة. */
export const SAVED_EVENT = "jdatna:saved";
/** عمليات ليست «حفظًا» يراه المستخدم: الرسائل، والدخول، والإشعارات، والفحص. */
const NOT_A_SAVE = [
  "/api/conversations",
  "/api/auth",
  "/api/logout",
  "/api/push",
  "/api/coverage/check",
  "/api/account/delete",
  "/api/producer/orders/alerts",
  "/api/session",
];
function announceSaved(url: string, method = "GET") {
  const m = method.toUpperCase();
  if (m === "GET" || typeof window === "undefined") return;
  const path = url.split("?")[0];
  if (NOT_A_SAVE.some((p) => path.startsWith(p))) return;
  window.dispatchEvent(
    new CustomEvent(SAVED_EVENT, {
      detail: m === "DELETE" ? "تم الحذف" : "تم الحفظ",
    }),
  );
}
type SessionData = { user: SessionUser | null; registrationOpen: boolean };
/**
 * طلب الجلسة مشترك بين كل مكوّنات الصفحة: كانت صفحة الإدارة وحدها تطلبه 11 مرة.
 * يُعاد استخدام الطلب نفسه لثوانٍ قليلة ثم يُطلب من جديد، فلا تبقى جلسة قديمة بعد الدخول أو الخروج.
 */
let sessionRequest: { at: number; p: Promise<SessionData> } | null = null;
export function loadSession(fresh = false) {
  if (fresh || !sessionRequest || Date.now() - sessionRequest.at > 4000) {
    const p = api<SessionData>("/api/session");
    sessionRequest = { at: Date.now(), p };
    p.catch(() => {
      sessionRequest = null;
    });
  }
  return sessionRequest.p;
}
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    loadSession()
      .then((d) => {
        setUser(d.user);
        setOpen(d.registrationOpen);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  return { user, setUser, ready, open, error };
}
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
/** حساب أسرة: دوره أسرة منتجة، أو له ملف أسرة (مثل المدير الكامل). */
export function isFamilyAccount(user: SessionUser | null | undefined) {
  return Boolean(user && (user.role === "producer" || user.familyName));
}
/** نوع الحساب كما يُكتب تحت الاسم. */
export function accountKind(user: SessionUser) {
  if (user.role === "courier") return "حساب مندوب";
  if (isFamilyAccount(user)) return "حساب أسرة منتجة";
  // الحساب الخاص منفصل عن حساب الإدارة: صاحب الصلاحيات هنا عضو كغيره.
  return "حساب عميل";
}
function AccountNavigation() {
  const { user } = useSession();
  const path = usePathname();
  if (!user) return null;
  // حساب أسرة: دوره أسرة منتجة، أو المدير الكامل الذي له ملف أسرة.
  const family = isFamilyAccount(user);
  const links: [string, string][] = [
    ["/", "الرئيسية"],
    ["/orders", "طلباتي"],
    ["/messages", "المحادثات"],
    ["/my-subscriptions", "اشتراكاتي"],
    ["/me", "معلوماتي"],
    ...((user.role === "courier"
      ? [["/courier", "لوحتي كمندوب"]]
      : family
        ? // أقسام الأسرة في «لوحتي» بمربعات، و«مندوبي الخاص» ظاهر في القائمة أيضًا.
          [
            ["/dashboard", "لوحتي"],
            ["/dashboard/couriers", "مندوبي الخاص"],
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
  { id: "coverage", label: "التغطية", href: "/dashboard/coverage" },
  // مندوب الأسرة الخاص: تسجّله بنفسها بتعهّد، دون اعتماد الإدارة.
  { id: "couriers", label: "مندوبي الخاص", href: "/dashboard/couriers" },
];
function FamilyTabs({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const path = usePathname();
  const tab = FAMILY_TABS.find((t) => t.href === path);
  if (!user || !isFamilyAccount(user) || !tab) return <>{children}</>;
  return (
    <FolderTabs label="أقسام الأسرة المنتجة" tabs={FAMILY_TABS} active={tab.id}>
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
  function switchMode(next: typeof mode) {
    setMode(next);
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
    window.location.assign(next === destination ? next : destination);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
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
            ...(mode === "signup" ? { name: f.get("name") } : {}),
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
      setError((e as Error).message);
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
              : "نرسل رمزًا من أربعة أرقام لإنشاء حسابك لأول مرة، ثم تعيّن كلمة مرور للدخول. لا تشارك الرمز مع أي شخص."}
      </p>
      {register && (
        <p className={s.notice}>
          بعد الدخول يمكنك استكمال طلب الأسرة المنتجة؛ يخضع الاعتماد لمراجعة
          الإدارة.
        </p>
      )}
      <Message error={error || session.error} />
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
                pattern="[0-9٠-٩۰-۹]{4}"
                minLength={4}
                maxLength={4}
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
                  pattern="[0-9٠-٩۰-۹]{4}"
                  minLength={4}
                  maxLength={4}
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
