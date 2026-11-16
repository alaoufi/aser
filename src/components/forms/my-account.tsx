"use client";
import { PasswordField } from "./password-field";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import { isManager } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";

/** «معلوماتي»: بيانات الحساب الشخصي (طالب خدمة أو أسرة)، منفصلة عن حساب الإدارة. */
export function MyAccount() {
  const session = useSession();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => setMe(session.user), [session.user]);
  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await api<{ user: SessionUser }>("/api/account/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMe(r.user);
      setSuccess(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <h1>معلوماتي</h1>
      <Guard {...session} />
      {me && (
        <>
          <p className={s.muted}>
            حسابك الشخصي: طلباتك ومحادثاتك وبياناتك
            {me.role === "producer" ? " ولوحة أسرتك" : ""}.
            {isManager(me) && " إدارة المنصة في «حساب الإدارة» منفصلة عنه."}
          </p>
          <Message error={error} success={success} />
          <form
            className={`${s.form} ${s.card}`}
            aria-label="البيانات الشخصية"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await save({ name: f.get("name") }, "تم حفظ الاسم ✓");
            }}
          >
            <h2>البيانات الشخصية</h2>
            <label className={s.field}>
              الاسم
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={me.name}
                key={me.name}
              />
            </label>
            <label className={s.field}>
              رقم الجوال
              <input value={me.phone} dir="ltr" readOnly />
            </label>
            {me.username && (
              <label className={s.field}>
                اسم المستخدم
                <input value={me.username} dir="ltr" readOnly />
              </label>
            )}
            <button className={s.button} disabled={busy}>
              حفظ الاسم
            </button>
          </form>
          <form
            className={`${s.form} ${s.card}`}
            aria-label="تغيير كلمة المرور"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (f.get("newPassword") !== f.get("confirm")) {
                setError("كلمتا المرور الجديدتان غير متطابقتين.");
                return;
              }
              if (
                await save(
                  {
                    currentPassword: f.get("currentPassword"),
                    newPassword: f.get("newPassword"),
                  },
                  "تم تغيير كلمة المرور ✓ وخرجت أجهزتك الأخرى.",
                )
              )
                form.reset();
            }}
          >
            <h2>تغيير كلمة المرور</h2>
            <PasswordField
              label="كلمة المرور الحالية"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
            <PasswordField
              label="كلمة المرور الجديدة"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={4}
            />
            <PasswordField
              label="تأكيد كلمة المرور الجديدة"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={4}
            />
            <button className={s.button} disabled={busy}>
              تغيير كلمة المرور
            </button>
          </form>
          <div className={s.actions}>
            <Link href="/account/delete">حذف حسابي</Link>
          </div>
        </>
      )}
    </AccountShell>
  );
}
