"use client";
import { useEffect, useRef, useState } from "react";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
const meals: Record<string, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  occasion: "مناسبة",
};
const statuses: Record<string, string> = {
  pending: "بانتظار اتفاق الأسرة",
  accepted: "قبلته الأسرة",
  declined: "اعتذرت الأسرة",
  completed: "مكتمل",
  cancelled: "ملغى",
};
type Draft = {
  notCookingToday?: boolean;
  productId: string;
  productName: string;
  quantity: number;
  meal: string;
  days: number;
  notes: string;
};
type Order = {
  id: string;
  productId: string;
  snapshot: {
    productName: string;
    producerName: string;
    unit: string;
    price: number | null;
    offer: { label: string; price: number | null } | null;
  };
  name: string;
  phone: string;
  quantity: number;
  meal: string;
  days: number;
  startDate: string;
  endDate: string;
  notes: string;
  status: string;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function OrderRequestForm({
  notCookingToday = false,
  productId,
  productName,
  offerId,
  initialDraft,
}: {
  notCookingToday?: boolean;
  productId: string;
  productName: string;
  offerId?: string;
  initialDraft?: Draft;
}) {
  const session = useSession();
  const minStart = notCookingToday
    ? new Date(new Date(today() + "T00:00:00Z").getTime() + 86400000)
        .toISOString()
        .slice(0, 10)
    : today();
  const [mode, setMode] = useState("days");
  const [selectedOffer, setSelectedOffer] = useState<{
    id: string;
    productId: string;
    title: string;
    price: number | null;
    terms: string;
    meal: string;
  } | null>(null);
  const [offerReady, setOfferReady] = useState(!offerId),
    [offerError, setOfferError] = useState("");
  useEffect(() => {
    let active = true;
    setSelectedOffer(null);
    setOfferError("");
    setOfferReady(!offerId);
    if (!offerId || !session.ready)
      return () => {
        active = false;
      };
    api<{
      offer: {
        id: string;
        productId: string;
        title: string;
        price: number | null;
        terms: string;
        meal: string;
      };
    }>(
      `/api/offers/${encodeURIComponent(offerId)}?productId=${encodeURIComponent(productId)}`,
    )
      .then(({ offer }) => {
        if (!active) return;
        if (offer.id !== offerId || offer.productId !== productId)
          throw new Error("العرض غير متاح لهذا المنتج");
        setSelectedOffer(offer);
      })
      .catch((e) => {
        if (active) setOfferError((e as Error).message);
      })
      .finally(() => {
        if (active) setOfferReady(true);
      });
    return () => {
      active = false;
    };
  }, [offerId, productId, session.ready, session.user?.id]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offerId && (!offerReady || !selectedOffer)) {
      setError("لا يمكن إرسال الطلب قبل التحقق من إتاحة العرض");
      return;
    }
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      productId,
      ...(offerId ? { offerId } : {}),
      name: form.get("name"),
      phone: form.get("phone"),
      quantity: Number(form.get("quantity")),
      meal: selectedOffer?.meal ?? form.get("meal"),
      startDate: form.get("startDate"),
      ...(mode === "endDate"
        ? { endDate: form.get("endDate") }
        : {
            days:
              mode === "month"
                ? 30
                : mode === "week"
                  ? 7
                  : Number(form.get("days")),
          }),
      notes: form.get("notes"),
    };
    const encoded = JSON.stringify(payload);
    if (attempt.current?.payload !== encoded)
      attempt.current = { payload: encoded, key: crypto.randomUUID() };
    try {
      const result = await api<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ ...payload, requestKey: attempt.current.key }),
      });
      setReceipt(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={s.card}
      aria-label="طلب المنتج"
      style={{ minWidth: 0, overflowWrap: "anywhere" }}
    >
      <h2>طلب {productName}</h2>
      {notCookingToday && (
        <p role="status" className={s.notice}>
          لا يوجد طبخ اليوم؛ اختر تاريخ بداية من الغد.
        </p>
      )}
      <p className={s.notice}>
        إرسال طلب مبدئي للأسرة. تأكيد التوفر والاتفاق والسداد خارج الموقع؛ لا
        دفع أو تجديد تلقائي.
      </p>
      {offerId && !offerReady && <p role="status">جارٍ التحقق من العرض…</p>}
      {selectedOffer && (
        <div className={s.notice}>
          <h3>{selectedOffer.title}</h3>
          <p>
            سعر العرض للوحدة:{" "}
            {selectedOffer.price === null
              ? "بالاتفاق"
              : `${selectedOffer.price} ر.س`}
          </p>
          <p>شروط الأسرة: {selectedOffer.terms}</p>
          <p>تتحقق الأسرة من شروط الاستحقاق خارج الموقع.</p>
        </div>
      )}
      <Message error={offerError || error} />
      {receipt ? (
        <div role="status">
          <p>
            وصل طلبك للأسرة وبانتظار الاتفاق. احتفظ بالمرجع:{" "}
            <bdi>{receipt}</bdi>
          </p>
          <p>
            {session.user ? (
              <a href="/orders">عرض سجل طلباتي</a>
            ) : (
              "طلب الضيف لا يظهر في سجل الحساب ولا يمكن استرجاع تفاصيله برقم الجوال."
            )}
          </p>
        </div>
      ) : (
        <form className={s.form} onSubmit={submit}>
          {!session.user && (
            <p className={s.muted}>
              يمكنك الطلب كضيف. <a href="/login">سجّل الدخول أولًا</a> لحفظ
              الطلب في سجلك.
            </p>
          )}
          <div
            className={s.grid}
            style={{
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(100%,240px),1fr))",
            }}
          >
            <label className={s.field}>
              الاسم
              <input
                key={session.user?.id ?? "guest-name"}
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={session.user?.name}
              />
            </label>
            <label className={s.field}>
              الجوال
              <input
                key={session.user?.phone ?? "guest-phone"}
                name="phone"
                type="tel"
                dir="ltr"
                autoComplete="tel"
                required
                maxLength={30}
                defaultValue={session.user?.phone}
              />
            </label>
            <label className={s.field}>
              الكمية لكل يوم
              <input
                name="quantity"
                type="number"
                min={1}
                max={1000}
                step={1}
                required
                defaultValue={initialDraft?.quantity ?? 1}
              />
            </label>
            <label className={s.field}>
              <span className="sr-only">الوجبة</span>
              <select
                name="meal"
                required
                key={selectedOffer?.id ?? "no-offer"}
                disabled={Boolean(selectedOffer)}
                defaultValue={selectedOffer?.meal ?? initialDraft?.meal ?? ""}
              >
                <option value="" disabled>
                  اختر الوجبة
                </option>
                {Object.entries(meals).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              تاريخ البداية
              <input name="startDate" type="date" required min={minStart} />
            </label>
            <label className={s.field}>
              <span className="sr-only">طريقة تحديد المدة</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="" disabled>
                  اختر المدة
                </option>
                <option value="days">عدد الأيام</option>
                <option value="endDate">حتى تاريخ معين (شامل)</option>
                <option value="week">أسبوع (7 أيام)</option>
                <option value="month">شهر (30 يومًا)</option>
              </select>
            </label>
            {mode === "days" && (
              <label className={s.field}>
                عدد الأيام
                <input
                  name="days"
                  type="number"
                  min={1}
                  max={366}
                  step={1}
                  required
                  defaultValue={initialDraft?.days ?? 1}
                />
              </label>
            )}
            {mode === "endDate" && (
              <label className={s.field}>
                تاريخ النهاية (شامل)
                <input name="endDate" type="date" min={minStart} required />
              </label>
            )}
          </div>
          <label className={s.field}>
            ملاحظات
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={initialDraft?.notes}
            />
          </label>
          <button
            className={s.button}
            disabled={
              busy ||
              !session.ready ||
              Boolean(offerId && (!offerReady || !selectedOffer))
            }
          >
            {busy ? "جارٍ إرسال الطلب…" : "إرسال الطلب للأسرة"}
          </button>
        </form>
      )}
    </section>
  );
}
export function Orders({ producer = false }: { producer?: boolean }) {
  const session = useSession();
  const [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null);
  const endpoint = producer ? "/api/producer/orders" : "/api/orders";
  async function load() {
    const result = await api<{ orders: Order[] }>(endpoint);
    setOrders(result.orders);
  }
  useEffect(() => {
    if (session.user)
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user, endpoint]);
  async function update(id: string, status: string) {
    setBusy(true);
    setError("");
    try {
      await api(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reorder(id: string) {
    setBusy(true);
    setError("");
    try {
      setDraft(await api<Draft>(`/api/orders/${id}/reorder`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <h1>{producer ? "طلبات الأسرة" : "طلباتي"}</h1>
      <Guard {...session} />
      <Message error={error} />
      {session.user && (
        <>
          <p className={s.muted}>
            آخر 200 طلب. الاتفاق والسداد خارج الموقع. قبول الأسرة لا يعني دفع
            المبلغ.
          </p>
          {loaded && !orders.length && <p>لا توجد طلبات حتى الآن.</p>}
          {draft && (
            <div>
              <button
                type="button"
                className={s.button}
                onClick={() => setDraft(null)}
              >
                إغلاق المسودة
              </button>
              <p>
                مسودة جديدة: اختر تاريخًا جديدًا وراجع التفاصيل. لا يُعاد العرض
                أو السعر السابق تلقائيًا.
              </p>
              <p>
                <a href={`/products/${draft.productId}`}>
                  راجع المنتج والسعر الحالي قبل إرسال المسودة
                </a>
                . السعر النهائي بالاتفاق مع الأسرة.
              </p>
              <OrderRequestForm
                key={draft.productId + JSON.stringify(draft)}
                {...draft}
                initialDraft={draft}
              />
            </div>
          )}
          {orders.map((order) => (
            <article
              className={s.card}
              key={order.id}
              style={{ overflowWrap: "anywhere" }}
            >
              <h2>{order.snapshot.productName}</h2>
              <p>
                {order.snapshot.producerName} — {statuses[order.status]}
              </p>
              <p>
                {meals[order.meal]}، {order.quantity} {order.snapshot.unit} لكل
                يوم، {order.days} أيام
              </p>
              <p>
                <bdi>{order.startDate}</bdi> إلى <bdi>{order.endDate}</bdi>
              </p>
              {order.snapshot.offer && (
                <p>العرض عند الإرسال: {order.snapshot.offer.label}</p>
              )}
              <p>
                السعر عند الإرسال:{" "}
                {(order.snapshot.offer
                  ? order.snapshot.offer.price
                  : order.snapshot.price) === null
                  ? "بالاتفاق"
                  : `${order.snapshot.offer ? order.snapshot.offer.price : order.snapshot.price} ر.س للوحدة، قبل الاتفاق`}
              </p>
              {order.notes && <p>{order.notes}</p>}
              {producer ? (
                <>
                  <p>
                    {order.name} —{" "}
                    <a href={`tel:${order.phone}`} dir="ltr">
                      {order.phone}
                    </a>
                  </p>
                  {(order.status === "pending"
                    ? ["accepted", "declined", "cancelled"]
                    : order.status === "accepted"
                      ? ["completed", "cancelled"]
                      : []
                  ).map((status) => (
                    <button
                      className={s.button}
                      key={status}
                      disabled={busy}
                      onClick={() => update(order.id, status)}
                    >
                      {statuses[status]}
                    </button>
                  ))}
                </>
              ) : (
                <button
                  className={s.button}
                  disabled={busy}
                  onClick={() => reorder(order.id)}
                >
                  إعداد طلب جديد من المنتج
                </button>
              )}
            </article>
          ))}
        </>
      )}
    </AccountShell>
  );
}
