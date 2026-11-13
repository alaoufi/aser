"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useSession } from "./shared";
import { stopPushOnLogout } from "@/components/public/push-setup";
import {
  DELETE_CONFIRMATION as CONFIRM,
  DELETE_CONFIRMATION_LATIN,
  isDeleteConfirmation,
} from "@/lib/delete-confirmation";

/** نموذج حذف الحساب: يكتب المستخدم «حذف حسابي» ثم يؤكد. */
export function DeleteAccount({
  embedded = false,
}: { embedded?: boolean } = {}) {
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
        // التأكيد الأخير قبل الحذف النهائي.
        if (
          !window.confirm(
            "تأكيد أخير: سيُحذف حسابك وكل متعلقاته نهائيًا ولا يمكن استرجاعه. هل تريد المتابعة؟",
          )
        ) {
          setBusy(false);
          return;
        }
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
      {!embedded && <h2>تأكيد الحذف</h2>}
      <p>
        الحساب: <strong>{session.user.name}</strong> (
        <bdi>{session.user.phone}</bdi>)
      </p>
      <label htmlFor="delete-confirm">
        اكتب «{CONFIRM}» للتأكيد (أو{" "}
        <bdi dir="ltr">{DELETE_CONFIRMATION_LATIN}</bdi>)
      </label>
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
        disabled={busy || !isDeleteConfirmation(text)}
      >
        {busy ? "جارٍ الحذف…" : "حذف حسابي نهائيًا"}
      </button>
    </form>
  );
}

/**
 * «حذف حسابي» داخل الحساب: زر ثم تحذير بما يُحذف، ثم كتابة «حذف حسابي»،
 * ثم تأكيد أخير — ثلاث رسائل تأكيد قبل الحذف النهائي.
 */
export function DeleteAccountSection() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  return (
    <section className="delete-account-section" aria-label="حذف الحساب">
      {step === 0 && (
        <button
          type="button"
          className="delete-account-open"
          onClick={() => setStep(1)}
        >
          حذف حسابي
        </button>
      )}
      {step === 1 && (
        <div
          className="delete-account"
          role="alertdialog"
          aria-label="هل تريد حذف حسابك؟"
        >
          <h2>هل تريد حذف حسابك؟</h2>
          <p>
            سيُحذف حسابك وكل متعلقاته نهائيًا: طلباتك، وتقييماتك، وللأسرة
            المنتجة منتجاتها وعروضها وطلباتها وصورها ومستنداتها. تبقى المحادثات
            فقط للرجوع إليها عند النزاع. لا يمكن التراجع بعد الحذف.
          </p>
          <div className="delete-account-actions">
            <button type="button" className="button" onClick={() => setStep(0)}>
              تراجع، أبقِ حسابي
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => setStep(2)}
            >
              نعم، أريد الحذف
            </button>
          </div>
        </div>
      )}
      {step === 2 && (
        <>
          <DeleteAccount embedded />
          <button
            type="button"
            className="delete-account-cancel"
            onClick={() => setStep(0)}
          >
            إلغاء
          </button>
        </>
      )}
    </section>
  );
}
