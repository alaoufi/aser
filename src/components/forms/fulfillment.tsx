"use client";
import { useEffect, useState } from "react";
import { api, Message, s } from "./shared";
import { LocationInput } from "./location-share";

type State = {
  pickup: boolean;
  delivery: boolean;
  pickupLocation: string | null;
};

/** طرق التسليم في لوحة الأسرة: تسليم مباشر، أو توصيل، أو كلاهما. تظهر للعميل عند الطلب. */
export function FulfillmentCard() {
  const [state, setState] = useState<State | null>(null),
    [pickup, setPickup] = useState(false),
    [delivery, setDelivery] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    api<State>("/api/producer/fulfillment")
      .then((v) => {
        setState(v);
        setPickup(v.pickup);
        setDelivery(v.delivery);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!pickup && !delivery) {
      setError("اختر التسليم المباشر أو التوصيل، أو كليهما.");
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const saved = await api<State>("/api/producer/fulfillment", {
        method: "PUT",
        body: JSON.stringify({
          pickup,
          delivery,
          pickupLocation: pickup ? String(f.get("pickupLocation") ?? "") : null,
        }),
      });
      setState(saved);
      setSuccess("تم حفظ طرق التسليم ✓");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={s.card}
      aria-label="طرق التسليم"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>طرق التسليم</h2>
      <p className={s.muted}>
        اختر طريقة أو أكثر، وتظهر للعميل عند الطلب. في التسليم المباشر يرى
        العميل موقعك بعد قبولك طلبه، وفي التوصيل يرسل لك العميل موقعه.
      </p>
      <Message error={error} success={success} />
      {state && (
        <form className={s.form} onSubmit={save}>
          <fieldset>
            <legend>طرق التسليم المتاحة</legend>
            <div className={s.checks}>
              <label>
                <input
                  type="checkbox"
                  checked={pickup}
                  onChange={(e) => setPickup(e.target.checked)}
                />
                تسليم مباشر (يستلم العميل من موقعك)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={delivery}
                  onChange={(e) => setDelivery(e.target.checked)}
                />
                توصيل (لموقع العميل)
              </label>
            </div>
          </fieldset>
          {pickup && (
            <LocationInput
              name="pickupLocation"
              label="موقع التسليم المباشر"
              hint="العنوان أو رابط الخرائط. يظهر للعميل بعد قبولك طلبه فقط."
              defaultValue={state.pickupLocation}
              required
            />
          )}
          <button className={s.button} disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ طرق التسليم"}
          </button>
        </form>
      )}
    </section>
  );
}
