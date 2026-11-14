"use client";
import { useEffect, useState } from "react";
import { api, Message, s } from "./shared";

type State = {
  showPhone: boolean;
  showWhatsapp: boolean;
  phone: string;
  whatsapp: string | null;
};

/** ظهور بيانات التواصل للعملاء: الجوال وواتساب، كلٌّ على حدة. المحادثة داخل الموقع تبقى متاحة. */
export function ContactVisibilityCard() {
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    api<State>("/api/producer/contact")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  async function save(next: Pick<State, "showPhone" | "showWhatsapp">) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      setState(
        await api<State>("/api/producer/contact", {
          method: "PUT",
          body: JSON.stringify(next),
        }),
      );
      setSuccess("تم الحفظ ✓");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={s.card}
      aria-label="ظهور بيانات التواصل للعملاء"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>ظهور بيانات التواصل للعملاء</h2>
      <p className={s.muted}>
        اختر ما يظهر للعملاء في صفحة أسرتك وصفحات منتجاتك. المحادثة داخل الموقع
        متاحة دائمًا.
      </p>
      <Message error={error} success={success} />
      {state && (
        <fieldset disabled={busy}>
          <legend className="sr-only">بيانات التواصل الظاهرة</legend>
          <div className={s.checks}>
            <label>
              <input
                type="checkbox"
                checked={state.showWhatsapp}
                onChange={(e) =>
                  save({
                    showPhone: state.showPhone,
                    showWhatsapp: e.target.checked,
                  })
                }
              />
              واتساب <bdi dir="ltr">{state.whatsapp || state.phone}</bdi>
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.showPhone}
                onChange={(e) =>
                  save({
                    showPhone: e.target.checked,
                    showWhatsapp: state.showWhatsapp,
                  })
                }
              />
              جوال (اتصال) <bdi dir="ltr">{state.phone}</bdi>
            </label>
          </div>
          {!state.whatsapp && (
            <small>
              واتساب على رقم جوالك. لرقم آخر أضفه في «تفاصيل إضافية» ببيانات
              الأسرة.
            </small>
          )}
        </fieldset>
      )}
    </section>
  );
}
