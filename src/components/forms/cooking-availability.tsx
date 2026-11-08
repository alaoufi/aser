"use client";
import { useEffect, useState } from "react";
import { api, Message, s } from "./shared";
type State = { day: string; notCookingToday: boolean };
export function CookingAvailability() {
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<State>("/api/producer/availability")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  async function toggle() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      setState(
        await api<State>("/api/producer/availability", {
          method: "PUT",
          body: JSON.stringify({ notCookingToday: !state.notCookingToday }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={s.card}
      aria-label="حالة الطبخ اليوم"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>حالة الطبخ اليوم</h2>
      <Message error={error} />
      {state ? (
        <>
          <p>
            بتوقيت الرياض · <bdi>{state.day}</bdi>
          </p>
          <p role="status">
            {state.notCookingToday ? "لا يوجد طبخ اليوم" : "الطبخ متاح اليوم"}
          </p>
          <p>
            هذا الاختيار لليوم فقط ويعود تلقائيًا في اليوم التالي. تبقى منتجاتك
            وحالة اعتماد أسرتك كما هي، ويمكن استقبال طلبات تبدأ من الغد.
          </p>
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={toggle}
          >
            {busy
              ? "جارٍ الحفظ…"
              : state.notCookingToday
                ? "إتاحة الطبخ اليوم"
                : "لا يوجد طبخ اليوم"}
          </button>
        </>
      ) : (
        !error && <p role="status">جارٍ تحميل الحالة…</p>
      )}
    </section>
  );
}
