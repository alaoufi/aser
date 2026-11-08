"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SessionUser } from "@/lib/types";
import s from "./account.module.css";
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
    throw new Error(data.error || "تعذر إتمام الطلب. يرجى المحاولة مجددًا.");
  return data as T;
}
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ user: SessionUser | null; registrationOpen: boolean }>("/api/session")
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
export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <section className={s.shell}>
      <nav aria-label="حسابي" className={s.nav}>
        <Link href="/">الرئيسية</Link>
        <Link href="/dashboard">لوحة الأسرة</Link>
        <Link href="/dashboard/products">المنتجات</Link>
        <Link href="/dashboard/offers">عروض الأسرة</Link>
        <Link href="/dashboard/orders">طلبات الأسرة</Link>
        <Link href="/dashboard/coverage">مناطق التغطية</Link>
        <Link href="/orders">طلباتي</Link>
        <Link href="/register">تسجيل أسرة</Link>
      </nav>
      {children}
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
  if (admin && user.role !== "admin")
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
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      if (!challenge) {
        const d = await api<{ challengeId: string }>("/api/auth/request-otp", {
          method: "POST",
          body: JSON.stringify({ phone }),
        });
        setChallenge(d.challengeId);
      } else {
        const d = await api<{ user: SessionUser }>("/api/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({
            challengeId: challenge,
            code: f.get("code"),
            name: f.get("name") || undefined,
          }),
        });
        if (onVerified) onVerified(d.user);
        else window.location.assign("/dashboard");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.card}>
      <h1>{register ? "لنبدأ برقم جوالك" : "أهلًا بعودتك"}</h1>
      <p className={s.muted}>
        رمز تحقق يحافظ على أمان حسابك. لا تشارك الرمز مع أي شخص.
      </p>
      <Message error={error || session.error} />
      {session.ready && !session.open && (
        <p role="status" className={s.notice}>
          التسجيل والتحقق برقم الجوال غير متاحين حاليًا حتى اكتمال جاهزية
          الخدمات. يمكنك تصفح الأسر والمنتجات دون حساب.
        </p>
      )}
      <form className={s.form} onSubmit={submit}>
        {register && (
          <label className={s.field}>
            اسم صاحب الحساب
            <input name="name" autoComplete="name" required maxLength={120} />
          </label>
        )}
        <label className={s.field}>
          رقم الجوال
          <input
            type="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder="05xxxxxxxx"
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
              pattern="[0-9]{4}"
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
          <button
            type="button"
            className={s.button}
            onClick={() => setChallenge("")}
          >
            تغيير الرقم
          </button>
        )}
      </form>
    </section>
  );
}
