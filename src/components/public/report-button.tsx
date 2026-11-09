"use client";
import { useId, useState } from "react";
import Link from "next/link";
type ReportTarget =
  | { productId: string; producerId?: never }
  | { producerId: string; productId?: never };
export function ReportButton(target: ReportTarget) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [login, setLogin] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || sent) return;
    const cleaned = reason.trim();
    if (cleaned.length < 10 || cleaned.length > 2000) {
      setMessage("اكتب سببًا واضحًا بين 10 و2000 حرف.");
      return;
    }
    setPending(true);
    setMessage("");
    setLogin(false);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, reason: cleaned }),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        setLogin(true);
        setMessage("يلزم تسجيل الدخول لإرسال البلاغ.");
        return;
      }
      if (!response.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "تعذّر إرسال البلاغ. حاول مرة أخرى لاحقًا.",
        );
        return;
      }
      if (!data || typeof data.id !== "string" || !data.id.trim()) {
        setMessage("لم نتمكن من تأكيد استلام البلاغ. حاول مرة أخرى لاحقًا.");
        return;
      }
      setSent(true);
      setReason("");
      setMessage("تم استلام البلاغ للمراجعة الإدارية. شكرًا لمساعدتك.");
    } catch {
      setMessage("تعذّر الاتصال. تحقق من الشبكة وحاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="report-control">
      <button
        type="button"
        className="report-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        الإبلاغ عن {target.productId ? "المنتج" : "الأسرة المنتجة"}
      </button>
      {open && (
        <div id={id} className="report-panel">
          <h3>ساعدنا نحافظ على مساحة آمنة</h3>
          <p className="muted">
            وضّح المخالفة أو المشكلة. لا تذكر بيانات هوية أو مستندات أو معلومات
            بنكية. البلاغ ليس طلب استرجاع أو شكوى طوارئ.
          </p>
          {!sent && (
            <form onSubmit={submit}>
              <label htmlFor={`${id}-reason`}>سبب البلاغ</label>
              <textarea
                id={`${id}-reason`}
                name="reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                aria-describedby={`${id}-hint`}
                placeholder="اكتب تفاصيل تساعد الإدارة على المراجعة"
              />
              <small id={`${id}-hint`}>
                من 10 إلى 2000 حرف. يُرسل البلاغ إلى إدارة المنصة.
              </small>
              <button
                className="button secondary"
                type="submit"
                disabled={pending}
              >
                {pending ? "جارٍ الإرسال…" : "إرسال البلاغ"}
              </button>
            </form>
          )}
          <p
            role="status"
            aria-live="polite"
            className={sent ? "report-success" : "report-message"}
          >
            {message}
          </p>
          {login && (
            <Link className="text-link" href="/login">
              سجّل الدخول لإرسال البلاغ ←
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
