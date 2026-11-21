"use client";
import { PasswordField } from "./password-field";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderTabs } from "./folder-tabs";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import type { SessionUser } from "@/lib/types";

const TABS = [
  { id: "profile", label: "البيانات الشخصية" },
  { id: "password", label: "كلمة المرور" },
  { id: "look", label: "المظهر" },
  { id: "delete", label: "حذف الحساب" },
];

/** «معلوماتي»: بيانات الحساب الشخصي (طالب خدمة أو أسرة)، منفصلة عن حساب الإدارة. */
export function MyAccount() {
  const session = useSession();
  const [tab, setTab] = useState("profile");
  // رابط مباشر لتبويب: /me#look
  useEffect(() => {
    const fromHash = () => {
      const id = location.hash.slice(1);
      if (TABS.some((t) => t.id === id)) setTab(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const choose = (id: string) => {
    setTab(id);
    history.replaceState(
      null,
      "",
      id === "profile" ? location.pathname : `#${id}`,
    );
  };
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
            {me.adminAccess &&
              " إدارة المنصة في «لوحة الإدارة» منفصلة عنه بجلستها."}
          </p>
          <Message error={error} success={success} />
          <FolderTabs
            label="أقسام معلوماتي"
            tabs={TABS}
            active={tab}
            onSelect={(id) => {
              setError("");
              setSuccess("");
              choose(id);
            }}
          >
            {tab === "profile" && (
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
            )}
            {tab === "password" && (
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
            )}
            {tab === "look" && <Appearance />}
            {tab === "delete" && (
              <section className={s.form} aria-label="حذف الحساب">
                <h2>حذف الحساب</h2>
                <p>
                  يحذف حسابك وبياناتك الشخصية نهائيًا بعد تأكيدات واضحة، ويمكنك
                  التراجع قبل آخرها.
                </p>
                <div className={s.actions}>
                  <Link href="/account/delete">حذف حسابي</Link>
                </div>
              </section>
            )}
          </FolderTabs>
        </>
      )}
    </AccountShell>
  );
}

/** «المظهر»: شكل الموقع لهذا الجهاز، يسري فورًا على كل الصفحات. */
function Appearance() {
  const router = useRouter();
  const [current, setCurrent] = useState<string>("");
  useEffect(
    () => setCurrent(document.documentElement.dataset.template ?? "classic"),
    [],
  );
  const pick = (template: "classic" | "najdi") => {
    document.cookie = `jdatna_template=${template}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setCurrent(template);
    router.refresh();
  };
  return (
    <section className={s.form} aria-label="المظهر">
      <h2>المظهر</h2>
      <p className={s.muted}>
        اختر شكل الموقع على هذا الجهاز؛ يُحفظ اختيارك ويسري على كل الصفحات.
      </p>
      <fieldset className={s.lookChoices}>
        <legend className="sr-only">شكل الموقع</legend>
        {(
          [
            ["classic", "الكلاسيكي", "ألوان الورق والزيتون، هادئ وواضح."],
            ["najdi", "الباب النجدي", "زخارف الباب النجدي ونقوشه التراثية."],
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            className={`${s.lookChoice} ${s[`look_${id}`]}`}
            aria-pressed={current === id}
            onClick={() => pick(id)}
          >
            <span className={s.lookSwatch} aria-hidden="true" />
            <strong>{label}</strong>
            <small>{hint}</small>
            {current === id && <span className={s.lookOn}>المختار ✓</span>}
          </button>
        ))}
      </fieldset>
    </section>
  );
}
