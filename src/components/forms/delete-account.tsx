"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useSession } from "./shared";
import { stopPushOnLogout } from "@/components/public/push-setup";

const CONFIRM = "حذف حسابي";

/** نموذج حذف الحساب: يكتب المستخدم «حذف حسابي» ثم يؤكد. */
export function DeleteAccount() {
  const session = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p role="status" className="notice">
        حُذف حسابك نهائيًا. شكرًا لأنك كنت معنا.{" "}
        <Link href="/">العودة للرئيسية</Link>
      </p>
    );
  if (!session.ready) return <p role="status">جارٍ التحقق من الحساب…</p>;
  if (!session.user)
    return (
      <p className="notice">
        لحذف حسابك <Link href="/login">سجّل الدخول</Link> أولًا برقم جوالك، ثم
        ارجع لهذه الصفحة من «حسابي».
      </p>
    );
  return (
    <form
      className="delete-account"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await stopPushOnLogout();
          await api("/api/account/delete", {
            method: "POST",
            body: JSON.stringify({ confirm: text }),
          });
          setDone(true);
          setTimeout(() => window.location.assign("/"), 2500);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <h2>تأكيد الحذف</h2>
      <p>
        الحساب: <strong>{session.user.name}</strong> (
        <bdi>{session.user.phone}</bdi>)
      </p>
      <label htmlFor="delete-confirm">اكتب «{CONFIRM}» للتأكيد</label>
      <input
        id="delete-confirm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      {error && (
        <p role="alert" className="delete-account-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button danger"
        disabled={busy || text.trim() !== CONFIRM}
      >
        {busy ? "جارٍ الحذف…" : "حذف حسابي نهائيًا"}
      </button>
    </form>
  );
}
