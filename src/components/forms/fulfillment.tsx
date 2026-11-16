"use client";
import { useEffect, useState } from "react";
import { api, Message, s } from "./shared";
import { LocationInput } from "./location-share";

type State = {
  pickup: boolean;
  delivery: boolean;
  pickupLocation: string | null;
  locationPublic: boolean;
};

/** طرق التسليم في لوحة الأسرة: تسليم مباشر، أو توصيل، أو كلاهما. تظهر للعميل عند الطلب. */
export function FulfillmentCard() {
  const [state, setState] = useState<State | null>(null),
    [pickup, setPickup] = useState(false),
    [delivery, setDelivery] = useState(false),
    [locationPublic, setLocationPublic] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    // تعذر التحميل (جلسة منتهية أو انقطاع): لا تظهر البطاقة بدل رسالة خطأ.
    [failed, setFailed] = useState(false);
  useEffect(() => {
    api<State>("/api/producer/fulfillment")
      .then((v) => {
        setState(v);
        setPickup(v.pickup);
        setDelivery(v.delivery);
        setLocationPublic(Boolean(v.locationPublic));
      })
      .catch(() => setFailed(true));
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
          pickupLocation: String(f.get("pickupLocation") ?? "").trim() || null,
          locationPublic,
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
  if (failed) return null;
  return (
    <section
      className={s.card}
      aria-label="طرق التسليم"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>طرق التسليم</h2>
      <p className={s.muted}>
        اختر طريقة أو أكثر، وتظهر للعميل عند الطلب. في التسليم المباشر يرى
        العميل موقعك بعد قبولك طلبه، وفي التوصيل يرسل لك العميل موقعه. احفظ موقع
        أسرتك ليصل للمندوب تلقائيًا عند استلام الطلبات.
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
          <LocationInput
            name="pickupLocation"
            label="موقع الأسرة"
            hint={
              pickup
                ? "العنوان أو رابط الخرائط. يظهر للعميل بعد قبولك طلبه، ويصل للمندوب ليستلم طلبات التوصيل."
                : "العنوان أو رابط الخرائط. يصل للمندوب ليستلم طلبات التوصيل منك، ولا يظهر للعملاء."
            }
            defaultValue={state.pickupLocation}
            required={pickup}
          />
          <fieldset>
            <legend>موقع الأسرة معلن في صفحتها؟</legend>
            <div className={s.checks}>
              <label>
                <input
                  type="radio"
                  name="locationPublic"
                  checked={locationPublic}
                  onChange={() => setLocationPublic(true)}
                />
                نعم، يظهر للجميع في صفحة الأسرة
              </label>
              <label>
                <input
                  type="radio"
                  name="locationPublic"
                  checked={!locationPublic}
                  onChange={() => setLocationPublic(false)}
                />
                لا، يصل للمندوب وصاحب الطلب فقط
              </label>
            </div>
          </fieldset>
          <button className={s.button} disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ طرق التسليم"}
          </button>
        </form>
      )}
    </section>
  );
}
