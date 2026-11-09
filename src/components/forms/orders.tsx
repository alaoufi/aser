"use client";
import { useEffect, useRef, useState } from "react";
import { ORDERS_CHANGED } from "@/components/public/order-alert";
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
  preparing: "قيد التجهيز لدى الأسرة",
  ready: "جاهز للتسليم",
  declined: "اعتذرت الأسرة",
  completed: "مكتمل",
  cancelled: "ملغى",
};
// مراحل تنفيذ الطلب كما تراها الأسرة، وأزرار الانتقال من كل مرحلة.
const stages = [
  ["pending", "جديد"],
  ["accepted", "مقبول"],
  ["preparing", "قيد التجهيز"],
  ["ready", "جاهز"],
  ["completed", "تم التسليم"],
] as const;
const producerStatus: Record<string, string> = {
  pending: "طلب جديد بانتظار ردك",
  accepted: "مقبول — ابدأ التجهيز في موعده",
  preparing: "قيد التجهيز",
  ready: "جاهز للتسليم",
  completed: "تم التسليم",
  declined: "اعتذرتَ عن الطلب",
  cancelled: "ملغى",
};
type Action = {
  to: string;
  label: string;
  primary?: boolean;
  confirm?: string;
};
const actions: Record<string, Action[]> = {
  pending: [
    { to: "accepted", label: "قبول الطلب", primary: true },
    {
      to: "declined",
      label: "اعتذار",
      confirm: "الاعتذار عن هذا الطلب نهائي. متأكد؟",
    },
  ],
  accepted: [
    { to: "preparing", label: "بدء التجهيز", primary: true },
    { to: "cancelled", label: "إلغاء", confirm: "إلغاء الطلب نهائي. متأكد؟" },
  ],
  preparing: [
    { to: "ready", label: "الطلب جاهز", primary: true },
    { to: "cancelled", label: "إلغاء", confirm: "إلغاء الطلب نهائي. متأكد؟" },
  ],
  ready: [
    { to: "completed", label: "تم التسليم", primary: true },
    { to: "cancelled", label: "إلغاء", confirm: "إلغاء الطلب نهائي. متأكد؟" },
  ],
};
const groups = [
  { title: "طلبات جديدة", match: ["pending"] },
  { title: "قيد التنفيذ", match: ["accepted", "preparing", "ready"] },
  { title: "منتهية", match: ["completed", "declined", "cancelled"] },
];
function whatsapp(phone: string, product: string) {
  const digits = phone.replace(/\D/g, "");
  const text = `السلام عليكم، بخصوص طلبك (${product}) من أكلات جدتنا`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
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
  isNew?: boolean;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
type Summary = {
  name: string;
  phone: string;
  quantity: number;
  meal: string;
  startDate: string;
  period: string;
  notes: string;
};
function periodLabel(payload: Record<string, unknown>) {
  if (payload.endDate) return `حتى ${payload.endDate}`;
  const days = Number(payload.days);
  if (days === 1) return "يوم واحد";
  if (days === 7) return "أسبوع (7 أيام)";
  if (days === 30) return "شهر (30 يومًا)";
  return `${days} أيام`;
}
export function OrderRequestForm({
  notCookingToday = false,
  productId,
  productName,
  offerId,
  initialDraft,
  unit,
  price,
  producerName,
  producerSlug,
  contactPhone,
  contactWhatsapp,
}: {
  notCookingToday?: boolean;
  productId: string;
  productName: string;
  offerId?: string;
  initialDraft?: Draft;
  unit?: string;
  price?: number | null;
  producerName?: string;
  producerSlug?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
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
    [receipt, setReceipt] = useState(""),
    [review, setReview] = useState<{
      payload: Record<string, unknown>;
      summary: Summary;
    } | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    if (receipt) receiptHeading.current?.focus();
  }, [receipt]);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  // الخطوة 1: مراجعة الطلب قبل الإرسال.
  function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offerId && (!offerReady || !selectedOffer)) {
      setError("لا يمكن إرسال الطلب قبل التحقق من إتاحة العرض");
      return;
    }
    setError("");
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
    setReview({
      payload,
      summary: {
        name: String(payload.name ?? ""),
        phone: String(payload.phone ?? ""),
        quantity: Number(payload.quantity),
        meal: String(payload.meal ?? ""),
        startDate: String(payload.startDate ?? ""),
        period: periodLabel(payload),
        notes: String(payload.notes ?? ""),
      },
    });
  }
  // الخطوة 2: تأكيد الإرسال.
  async function submit() {
    if (!review) return;
    setError("");
    setBusy(true);
    const payload = review.payload;
    const encoded = JSON.stringify(payload);
    if (attempt.current?.payload !== encoded)
      attempt.current = { payload: encoded, key: crypto.randomUUID() };
    try {
      const result = await api<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ ...payload, requestKey: attempt.current.key }),
      });
      setReceipt(result.id);
      setReview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const contact = (
    <div className={s.actions}>
      {contactPhone && (
        <a className={s.contact} href={`tel:+${contactPhone}`}>
          اتصال بالأسرة
        </a>
      )}
      {contactWhatsapp && (
        <a
          className={s.contact}
          href={`https://wa.me/${contactWhatsapp}?text=${encodeURIComponent(
            `السلام عليكم، أرسلت طلب (${productName}) من أكلات جدتنا${receipt ? ` — المرجع ${receipt.slice(0, 8)}` : ""}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          واتساب الأسرة
        </a>
      )}
    </div>
  );
  const summaryOf = (x: Summary) => (
    <dl className={s.orderFacts}>
      <div>
        <dt>المنتج</dt>
        <dd>
          {productName}
          {producerName ? ` — ${producerName}` : ""}
        </dd>
      </div>
      {selectedOffer && (
        <div>
          <dt>العرض</dt>
          <dd>{selectedOffer.title}</dd>
        </div>
      )}
      <div>
        <dt>الكمية لكل يوم</dt>
        <dd>
          {x.quantity} {unit ?? ""}
        </dd>
      </div>
      <div>
        <dt>الوجبة</dt>
        <dd>{meals[x.meal] ?? x.meal}</dd>
      </div>
      <div>
        <dt>من تاريخ</dt>
        <dd>
          <bdi>{x.startDate}</bdi>
        </dd>
      </div>
      <div>
        <dt>المدة</dt>
        <dd>{x.period}</dd>
      </div>
      <div>
        <dt>السعر</dt>
        <dd>
          {(selectedOffer ? selectedOffer.price : price) == null
            ? "بالاتفاق مع الأسرة"
            : `${selectedOffer ? selectedOffer.price : price} ر.س للوحدة، قبل الاتفاق`}
        </dd>
      </div>
      <div>
        <dt>باسم</dt>
        <dd>
          {x.name} — <bdi dir="ltr">{x.phone}</bdi>
        </dd>
      </div>
      {x.notes && (
        <div>
          <dt>ملاحظاتك</dt>
          <dd>{x.notes}</dd>
        </div>
      )}
    </dl>
  );
  const [sent, setSent] = useState<Summary | null>(null);
  useEffect(() => {
    if (review) setSent(review.summary);
  }, [review]);
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
        <div role="status" className={s.confirmation}>
          <h3 ref={receiptHeading} tabIndex={-1}>
            <span aria-hidden="true">✓</span> تم إرسال طلبك للأسرة
          </h3>
          <p>
            رقم المرجع: <bdi dir="ltr">{receipt.slice(0, 8)}</bdi>
          </p>
          {sent && summaryOf(sent)}
          <h4>الخطوة التالية</h4>
          <p>
            ستراجع الأسرة طلبك وتتواصل معك على جوالك لتأكيد التوفر والسعر
            والاستلام. السداد والاتفاق خارج الموقع.
          </p>
          {(contactPhone || contactWhatsapp) && (
            <>
              <p>للاستعجال أو الاستفسار تواصل مع الأسرة مباشرة:</p>
              {contact}
            </>
          )}
          {session.user ? (
            <p>
              <a href="/orders">تابع حالة طلبك من «طلباتي» ←</a>
            </p>
          ) : (
            <p className={s.muted}>
              طلب الضيف لا يظهر في سجل حساب. احتفظ برقم المرجع، أو{" "}
              <a href="/login">أنشئ حسابًا</a> لمتابعة طلباتك القادمة.
            </p>
          )}
          {producerSlug && (
            <p>
              <a href={`/producers/${producerSlug}`}>صفحة الأسرة ←</a>
            </p>
          )}
        </div>
      ) : (
        <>
          {review && (
            <section className={s.confirmation} aria-label="مراجعة الطلب">
              <h3 ref={reviewHeading} tabIndex={-1}>
                راجع طلبك قبل الإرسال
              </h3>
              {summaryOf(review.summary)}
              <p className={s.muted}>
                بالإرسال يصل الطلب للأسرة كطلب مبدئي، وتتواصل معك لتأكيده.
              </p>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.button}
                  disabled={busy}
                  onClick={submit}
                >
                  {busy ? "جارٍ إرسال الطلب…" : "تأكيد وإرسال الطلب"}
                </button>
                <button
                  type="button"
                  className={s.buttonSecondary}
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  تعديل الطلب
                </button>
              </div>
            </section>
          )}
          <form className={s.form} onSubmit={prepare} hidden={Boolean(review)}>
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
              مراجعة الطلب قبل الإرسال
            </button>
          </form>
        </>
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
  useEffect(() => {
    if (!producer || !session.user) return;
    const reload = () => {
      load().catch(() => {});
    };
    window.addEventListener(ORDERS_CHANGED, reload);
    return () => window.removeEventListener(ORDERS_CHANGED, reload);
  }, [producer, session.user]);
  async function update(id: string, status: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
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
          {producer &&
            groups.map((group) => {
              const list = orders.filter((o) => group.match.includes(o.status));
              if (!list.length) return null;
              return (
                <section key={group.title} aria-label={group.title}>
                  <h2 className={s.groupTitle}>
                    {group.title} <span className={s.tag}>{list.length}</span>
                  </h2>
                  {list.map((order) => (
                    <ProducerOrder
                      key={order.id}
                      order={order}
                      busy={busy}
                      onUpdate={update}
                    />
                  ))}
                </section>
              );
            })}
          {!producer &&
            orders.map((order) => (
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
                  {meals[order.meal]}، {order.quantity} {order.snapshot.unit}{" "}
                  لكل يوم، {order.days} أيام
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
                {
                  <button
                    className={s.button}
                    disabled={busy}
                    onClick={() => reorder(order.id)}
                  >
                    إعداد طلب جديد من المنتج
                  </button>
                }
              </article>
            ))}
        </>
      )}
    </AccountShell>
  );
}

function price(order: Order) {
  const value = order.snapshot.offer
    ? order.snapshot.offer.price
    : order.snapshot.price;
  return value === null ? "بالاتفاق" : `${value} ر.س للوحدة، قبل الاتفاق`;
}
function ProducerOrder({
  order,
  busy,
  onUpdate,
}: {
  order: Order;
  busy: boolean;
  onUpdate: (id: string, status: string, confirmText?: string) => void;
}) {
  const reached = stages.findIndex(([key]) => key === order.status);
  return (
    <article
      id={`order-${order.id}`}
      className={`${s.card} ${order.isNew ? s.cardNew : ""}`}
      style={{ overflowWrap: "anywhere" }}
    >
      <div className={s.orderHead}>
        <h3>{order.snapshot.productName}</h3>
        {order.isNew && <span className={s.tagNew}>جديد</span>}
      </div>
      <p className={s.orderStatus}>{producerStatus[order.status]}</p>
      {reached >= 0 && (
        <ol className={s.stepper} aria-label="مراحل تنفيذ الطلب">
          {stages.map(([key, label], i) => (
            <li
              key={key}
              className={i <= reached ? s.stepDone : undefined}
              aria-current={i === reached ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      )}
      <dl className={s.orderFacts}>
        <div>
          <dt>العميل</dt>
          <dd>{order.name}</dd>
        </div>
        <div>
          <dt>الكمية</dt>
          <dd>
            {order.quantity} {order.snapshot.unit} لكل يوم، {order.days} أيام
          </dd>
        </div>
        <div>
          <dt>الوجبة</dt>
          <dd>{meals[order.meal]}</dd>
        </div>
        <div>
          <dt>المدة</dt>
          <dd>
            <bdi>{order.startDate}</bdi> إلى <bdi>{order.endDate}</bdi>
          </dd>
        </div>
        {order.snapshot.offer && (
          <div>
            <dt>العرض</dt>
            <dd>{order.snapshot.offer.label}</dd>
          </div>
        )}
        <div>
          <dt>السعر عند الإرسال</dt>
          <dd>{price(order)}</dd>
        </div>
      </dl>
      {order.notes && (
        <p className={s.orderNotes}>ملاحظات العميل: {order.notes}</p>
      )}
      <div className={s.actions}>
        <a className={s.contact} href={`tel:${order.phone}`}>
          اتصال <bdi dir="ltr">{order.phone}</bdi>
        </a>
        <a
          className={s.contact}
          href={whatsapp(order.phone, order.snapshot.productName)}
          target="_blank"
          rel="noopener noreferrer"
        >
          واتساب
        </a>
      </div>
      {actions[order.status] && (
        <div className={s.actions}>
          {actions[order.status].map((a) => (
            <button
              type="button"
              key={a.to}
              className={a.primary ? s.button : s.buttonSecondary}
              disabled={busy}
              onClick={() => onUpdate(order.id, a.to, a.confirm)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
