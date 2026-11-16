"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LocationInput } from "./location-share";
import { collectIssues, FormIssues, type FormIssue } from "./form-issues";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";

const plans = [
  ["daily", "يومي"],
  ["weekly", "أسبوعي"],
  ["monthly", "شهري"],
  ["period", "مدة محددة"],
] as const;
const meals = [
  ["breakfast", "فطور"],
  ["lunch", "غداء"],
  ["dinner", "عشاء"],
] as const;
type PlanId = (typeof plans)[number][0];
type MealId = (typeof meals)[number][0];
const label = (list: readonly (readonly [string, string])[], id: string) =>
  list.find(([k]) => k === id)?.[1] ?? id;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );

type Plan = {
  enabled: boolean;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  period: boolean;
  meals: MealId[];
  delivery: boolean;
  notes: string;
};
type MenuItem = { id: string; meal: MealId; name: string };
const statusLabel: Record<string, string> = {
  new: "جديد بانتظار الاتفاق",
  agreed: "متفق عليه ✓",
  declined: "معتذر عنه",
  cancelled: "ملغى",
};
const menuExamples: Record<MealId, string> = {
  breakfast: "مثال: فول، عدس، بيض مسلوق مع الخبز",
  lunch: "مثال: كبسة رز مع لحم",
  dinner: "مثال: مرقوق لحم",
};
type IncomingRequest = {
  id: string;
  plan: PlanId;
  startDate: string;
  days: number | null;
  meals: MealId[];
  delivery: boolean;
  location: string | null;
  notes: string;
  status: string;
  conversationId: string | null;
  customerName: string;
  customerAgreedAt: string | null;
  contractId: string | null;
};

/** لوحة الأسرة ← «الاشتراكات»: ما تتيحه من أنواع ووجبات وتوصيل، والطلبات الواردة. */
export function FamilySubscriptions() {
  const session = useSession();
  const [data, setData] = useState<{
    plan: Plan;
    approved: boolean;
    familyDelivers: boolean;
    requests: IncomingRequest[];
    menu: MenuItem[];
    schedule: {
      day: string;
      rows: {
        id: string;
        customerName: string;
        delivery: boolean;
        location: string | null;
        meal: MealId;
        dish: string | null;
      }[];
    };
  } | null>(null);
  async function call(url: string, body: unknown, method = "POST") {
    setError("");
    try {
      return await api<unknown>(url, { method, body: JSON.stringify(body) });
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }
  async function reload() {
    setData(await api<NonNullable<typeof data>>("/api/producer/subscriptions"));
  }
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!session.user) return;
    api<NonNullable<typeof data>>("/api/producer/subscriptions")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [session.user?.id]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const d = await api<NonNullable<typeof data>>(
        "/api/producer/subscriptions",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: f.has("enabled"),
            daily: f.has("daily"),
            weekly: f.has("weekly"),
            monthly: f.has("monthly"),
            period: f.has("period"),
            meals: meals.map(([m]) => m).filter((m) => f.has("meal:" + m)),
            delivery: f.has("delivery"),
            notes: String(f.get("notes") ?? ""),
          }),
        },
      );
      setData(d);
      setSuccess(
        d.plan.enabled
          ? "تم الحفظ ✓ أسرتك تظهر الآن في «الاشتراكات» للعملاء."
          : "تم الحفظ ✓ الاشتراكات متوقفة ولا تظهر أسرتك فيها.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell>
      <h1>الاشتراكات</h1>
      <Guard {...session} />
      <Message error={error} success={success} />
      {data && (
        <>
          {!data.approved && (
            <p className={s.notice}>
              تظهر أسرتك للعملاء في «الاشتراكات» بعد اعتمادها.
            </p>
          )}
          <form className={`${s.form} ${s.card}`} onSubmit={save}>
            <label className={s.pledge}>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={data.plan.enabled}
              />
              <span>
                <strong>أقبل طلبات الاشتراك</strong> — تظهر أسرتك في صفحة
                «الاشتراكات» للعملاء في منطقتك.
              </span>
            </label>
            <fieldset>
              <legend>أنواع الاشتراك المتاحة</legend>
              <div className={s.checks}>
                {plans.map(([id, name]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      name={id}
                      defaultChecked={data.plan[id]}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>الوجبات</legend>
              <div className={s.checks}>
                {meals.map(([id, name]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      name={"meal:" + id}
                      defaultChecked={data.plan.meals.includes(id)}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={s.checks}>
              <span>
                <input
                  type="checkbox"
                  name="delivery"
                  defaultChecked={data.plan.delivery}
                  disabled={!data.familyDelivers}
                />{" "}
                مع التوصيل
              </span>
              {!data.familyDelivers && (
                <small className={s.muted}>
                  فعّل التوصيل في بيانات الأسرة أولًا.
                </small>
              )}
            </label>
            <label className={s.field}>
              ملاحظات تظهر للعملاء (اختياري)
              <textarea
                name="notes"
                maxLength={500}
                rows={2}
                defaultValue={data.plan.notes}
                placeholder="مثال: الاشتراك الشهري يشمل 26 يومًا"
              />
            </label>
            <button className={s.button} disabled={busy}>
              {busy ? "جارٍ الحفظ…" : "حفظ الاشتراكات"}
            </button>
          </form>
          <section className={s.card} aria-label="قائمة أطباق الاشتراك">
            <h2>قائمة أطباق الاشتراك</h2>
            <p className={s.muted}>
              أطباق كل وجبة يختار منها المشترك طبقه الدائم، ويغيّر طبق أي يوم
              قبله بيوم.
            </p>
            {meals.map(([id, name]) => {
              const items = data.menu.filter((m) => m.meal === id);
              return (
                <div key={id} className={s.menuMeal}>
                  <h3>{name}</h3>
                  {items.length === 0 ? (
                    <p className={s.muted}>لا أطباق بعد.</p>
                  ) : (
                    <ul>
                      {items.map((m) => (
                        <li key={m.id}>
                          {m.name}{" "}
                          <button
                            type="button"
                            className={s.linkButton}
                            aria-label={`حذف ${m.name}`}
                            onClick={async () => {
                              if (
                                await call(
                                  "/api/producer/subscriptions/menu",
                                  { id: m.id },
                                  "PATCH",
                                )
                              )
                                await reload();
                            }}
                          >
                            حذف
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form
                    className={s.menuAdd}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const name = String(
                        new FormData(form).get("name") ?? "",
                      ).trim();
                      if (!name) return;
                      if (
                        await call("/api/producer/subscriptions/menu", {
                          meal: id,
                          name,
                        })
                      ) {
                        form.reset();
                        await reload();
                      }
                    }}
                  >
                    <label className={s.field}>
                      <span className="sr-only">طبق {name} جديد</span>
                      <input
                        name="name"
                        maxLength={120}
                        placeholder={menuExamples[id]}
                      />
                    </label>
                    <button className={s.buttonSecondary}>
                      إضافة لـ{name}
                    </button>
                  </form>
                </div>
              );
            })}
          </section>
          <section className={s.card} aria-label="جدول الغد">
            <h2>
              جدول الغد <bdi>{data.schedule.day}</bdi>
            </h2>
            {data.schedule.rows.length === 0 ? (
              <p className={s.muted}>لا اشتراكات متفق عليها للغد.</p>
            ) : (
              <ul className={s.scheduleList}>
                {data.schedule.rows.map((r) => (
                  <li key={`${r.id}-${r.meal}`}>
                    <strong>{r.customerName}</strong> · {label(meals, r.meal)}:{" "}
                    {r.dish ?? <em>لم يختر طبقًا بعد</em>}
                    {r.delivery ? " · توصيل" : " · استلام"}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={s.card} aria-label="طلبات الاشتراك">
            <h2>طلبات الاشتراك</h2>
            {data.requests.length === 0 ? (
              <p className={s.muted}>لا توجد طلبات اشتراك بعد.</p>
            ) : (
              <ul className={s.courierList}>
                {data.requests.map((r) => (
                  <li key={r.id} className={s.card}>
                    <h3>{r.customerName}</h3>
                    <p>
                      {label(plans, r.plan)}
                      {r.plan === "period" ? ` (${r.days} يوم)` : ""} · يبدأ{" "}
                      <bdi>{r.startDate}</bdi>
                    </p>
                    <p>
                      {r.meals.map((m) => label(meals, m)).join("، ")} ·{" "}
                      {r.delivery ? "مع التوصيل" : "استلام"}
                    </p>
                    {r.notes && <p className={s.muted}>{r.notes}</p>}
                    <p>
                      الحالة:{" "}
                      <strong>{statusLabel[r.status] ?? r.status}</strong>
                    </p>
                    {r.status === "new" &&
                      (r.customerAgreedAt ? (
                        <>
                          <p className={s.notice}>
                            ضغط العميل «تم الاتفاق مع الأسرة». موافقتك تحفظ عقد
                            الاشتراك مع نسخة المحادثة، ولا يُعدَّل ولا يُحذف.
                          </p>
                          <button
                            type="button"
                            className={s.button}
                            onClick={async () => {
                              if (
                                await call(
                                  "/api/producer/subscriptions/decide",
                                  {
                                    id: r.id,
                                    status: "agreed",
                                  },
                                )
                              ) {
                                await reload();
                                setSuccess(
                                  "تمت الموافقة ✓ حُفظ عقد الاشتراك، ووصلت رسالة للعميل ليختار أطباقه.",
                                );
                              }
                            }}
                          >
                            أوافق على الاتفاق
                          </button>
                        </>
                      ) : (
                        <p className={s.muted}>
                          بانتظار أن يضغط العميل «تم الاتفاق مع الأسرة» بعد
                          اتفاقكما في المحادثة.
                        </p>
                      ))}
                    {r.contractId && (
                      <Link
                        href={`/contracts/${encodeURIComponent(r.contractId)}`}
                      >
                        عقد الاشتراك ←
                      </Link>
                    )}
                    {r.status === "new" && (
                      <button
                        type="button"
                        className={s.buttonSecondary}
                        onClick={async () => {
                          if (
                            await call("/api/producer/subscriptions/decide", {
                              id: r.id,
                              status: "declined",
                            })
                          )
                            await reload();
                        }}
                      >
                        اعتذار
                      </button>
                    )}
                    {r.conversationId && (
                      <Link
                        href={`/messages?c=${encodeURIComponent(r.conversationId)}`}
                      >
                        المحادثة للاتفاق ←
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AccountShell>
  );
}

/**
 * «طلب اشتراك» في بطاقة الأسرة: النوع وتاريخ البدء (وعدد الأيام للمدة المحددة) والوجبات والتوصيل،
 * ثم يُحوَّل العميل إلى المحادثة مع الأسرة للاتفاق.
 */
export function SubscriptionRequest({
  family,
  familyName,
  plans: allowed,
  meals: allowedMeals,
  delivery,
}: {
  family: string;
  familyName: string;
  plans: PlanId[];
  meals: MealId[];
  delivery: boolean;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanId | "">("");
  const [withDelivery, setWithDelivery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<FormIssue[]>([]);
  if (!session.ready) return null;
  if (!session.user)
    return (
      <Link className="button" href="/login">
        سجّل لطلب اشتراك
      </Link>
    );
  if (!open)
    return (
      <button type="button" className="button" onClick={() => setOpen(true)}>
        طلب اشتراك
      </button>
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found = collectIssues(form);
    setIssues(found);
    if (found.length) return;
    const f = new FormData(form);
    if (!allowedMeals.some((m) => f.has("meal:" + m))) {
      setError("اختر وجبة واحدة على الأقل (فطور أو غداء أو عشاء).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const d = await api<{ conversationId: string }>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          family,
          plan: f.get("plan"),
          startDate: f.get("startDate"),
          days: f.get("plan") === "period" ? Number(f.get("days")) : null,
          meals: allowedMeals.filter((m) => f.has("meal:" + m)),
          delivery: f.has("delivery"),
          location: String(f.get("location") ?? ""),
          notes: String(f.get("notes") ?? ""),
        }),
      });
      window.location.assign(
        `/messages?c=${encodeURIComponent(d.conversationId)}`,
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form
      className="subscription-form"
      onSubmit={submit}
      noValidate
      aria-label={`طلب اشتراك من ${familyName}`}
    >
      <fieldset>
        <legend>نوع الاشتراك</legend>
        {allowed.map((id) => (
          <label key={id} className="subscription-choice">
            <input
              type="radio"
              name="plan"
              value={id}
              required
              data-label="نوع الاشتراك"
              onChange={() => setPlan(id)}
            />
            {label(plans, id)}
          </label>
        ))}
      </fieldset>
      {plan && (
        <div className="subscription-dates">
          <label>
            {label(plans, plan)} يبدأ من تاريخ
            <input type="date" name="startDate" required min={today()} />
          </label>
          {plan === "period" && (
            <label>
              عدد الأيام
              <input
                type="number"
                name="days"
                required
                min={1}
                max={365}
                inputMode="numeric"
              />
            </label>
          )}
        </div>
      )}
      <fieldset>
        <legend>الوجبات</legend>
        {allowedMeals.map((id) => (
          <label key={id} className="subscription-choice">
            <input type="checkbox" name={"meal:" + id} />
            {label(meals, id)}
          </label>
        ))}
      </fieldset>
      {delivery && (
        <label className="subscription-choice">
          <input
            type="checkbox"
            name="delivery"
            checked={withDelivery}
            onChange={(e) => setWithDelivery(e.target.checked)}
          />
          مع التوصيل
        </label>
      )}
      {withDelivery && (
        <LocationInput
          name="location"
          label="موقع التوصيل"
          hint="يصل للأسرة مع الطلب."
          required
          autoLocate
        />
      )}
      <label>
        ملاحظات (اختياري)
        <textarea name="notes" rows={2} maxLength={1000} />
      </label>
      <FormIssues issues={issues} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="subscription-actions">
        <button className="button" disabled={busy}>
          {busy ? "جارٍ الإرسال…" : "أرسل الطلب وانتقل للمحادثة"}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(false)}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

type MySubscription = {
  id: string;
  familyName: string;
  slug: string;
  plan: PlanId;
  startDate: string;
  endDate: string | null;
  days: number | null;
  meals: MealId[];
  delivery: boolean;
  status: string;
  conversationId: string | null;
  customerAgreedAt: string | null;
  contractId: string | null;
  defaults: Partial<Record<MealId, string>>;
  overrides: { day: string; meal: MealId; itemId: string }[];
  menu: MenuItem[];
  itemNames: Record<string, string>;
  /** الأيام القادمة القابلة للتعديل (من الغد). */
  upcoming: string[];
};

const dayName = (day: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

/**
 * «اشتراكاتي»: بعد الاتفاق يختار العميل طبقًا دائمًا لكل وجبة من قائمة الأسرة،
 * ويغيّر طبق أي يوم قادم قبله بيوم على الأقل (يوم اليوم مقفل).
 */
export function MySubscriptions() {
  const session = useSession();
  const [data, setData] = useState<{
    today: string;
    firstEditable: string;
    subscriptions: MySubscription[];
  } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (!session.user) return;
    api<NonNullable<typeof data>>("/api/subscriptions/mine")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [session.user?.id]);
  async function put(body: Record<string, unknown>, done: string) {
    setError("");
    setSaved("");
    try {
      setData(
        await api<NonNullable<typeof data>>("/api/subscriptions/mine", {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      );
      setSaved(done);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <AccountShell>
      <h1>اشتراكاتي</h1>
      <Guard {...session} />
      <Message error={error} success={saved} />
      {data && data.subscriptions.length === 0 && (
        <p className={s.notice}>
          لا اشتراكات لديك بعد.{" "}
          <Link href="/subscriptions">تصفّح الأسر التي تقبل الاشتراكات ←</Link>
        </p>
      )}
      {data?.subscriptions.map((sub) => {
        const name = (id?: string) =>
          (id && sub.itemNames[id]) ||
          sub.menu.find((m) => m.id === id)?.name ||
          "";
        return (
          <section
            key={sub.id}
            className={s.card}
            aria-label={`اشتراك ${sub.familyName}`}
          >
            <h2>
              <Link href={`/producers/${sub.slug}`}>{sub.familyName}</Link>
            </h2>
            <p>
              {label(plans, sub.plan)} · من <bdi>{sub.startDate}</bdi>
              {sub.endDate ? (
                <>
                  {" "}
                  إلى <bdi>{sub.endDate}</bdi>
                </>
              ) : (
                " (مستمر)"
              )}{" "}
              · {sub.meals.map((m) => label(meals, m)).join("، ")}
            </p>
            <p>
              الحالة: <strong>{statusLabel[sub.status] ?? sub.status}</strong>
              {sub.conversationId && (
                <>
                  {" · "}
                  <Link
                    href={`/messages?c=${encodeURIComponent(sub.conversationId)}`}
                  >
                    المحادثة
                  </Link>
                </>
              )}
            </p>
            {sub.contractId && (
              <p>
                <Link href={`/contracts/${encodeURIComponent(sub.contractId)}`}>
                  عقد الاشتراك ←
                </Link>
              </p>
            )}
            {sub.status === "new" &&
              (sub.customerAgreedAt ? (
                <p className={s.notice}>
                  ضغطت «تم الاتفاق مع الأسرة» ✓ بانتظار موافقة الأسرة، فيُحفظ
                  عقد الاشتراك.
                </p>
              ) : (
                <div className={s.actions}>
                  <button
                    type="button"
                    className={s.button}
                    onClick={async () => {
                      setError("");
                      try {
                        setData(
                          await api<NonNullable<typeof data>>(
                            "/api/subscriptions/agree",
                            {
                              method: "POST",
                              body: JSON.stringify({ id: sub.id }),
                            },
                          ),
                        );
                        setSaved(
                          "تم ✓ أُرسلت للأسرة لتوافق، فيُحفظ عقد الاشتراك.",
                        );
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    تم الاتفاق مع الأسرة
                  </button>
                  <small className={s.muted}>
                    اضغطه بعد اتفاقكما في المحادثة؛ موافقة الأسرة تحفظ عقدًا لا
                    يُعدَّل ولا يُحذف.
                  </small>
                </div>
              ))}
            {sub.status !== "agreed" ? (
              <p className={s.muted}>
                تختار أطباقك بعد أن توافق الأسرة على الاتفاق.
              </p>
            ) : (
              <>
                <h3>طبقي الدائم لكل وجبة</h3>
                <div className={s.grid}>
                  {sub.meals.map((meal) => {
                    const options = sub.menu.filter((m) => m.meal === meal);
                    return (
                      <label key={meal} className={s.field}>
                        {label(meals, meal)}
                        <select
                          value={sub.defaults[meal] ?? ""}
                          onChange={(e) =>
                            e.target.value &&
                            put(
                              {
                                kind: "default",
                                id: sub.id,
                                meal,
                                itemId: e.target.value,
                              },
                              `تم حفظ طبق ${label(meals, meal)} الدائم ✓`,
                            )
                          }
                        >
                          <option value="">
                            {options.length
                              ? "اختر الطبق"
                              : "لم تضف الأسرة أطباقًا بعد"}
                          </option>
                          {sub.defaults[meal] &&
                            !options.some(
                              (o) => o.id === sub.defaults[meal],
                            ) && (
                              <option value={sub.defaults[meal]}>
                                {name(sub.defaults[meal])} (لم يعد في القائمة)
                              </option>
                            )}
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <h3>أيام قادمة</h3>
                <p className={s.muted}>
                  تغيّر طبق أي يوم قبله بيوم على الأقل. طلب اليوم (
                  <bdi>{data.today}</bdi>) لا يُعدَّل.
                </p>
                <ul className={s.subDays}>
                  {sub.upcoming.map((day) => (
                    <li key={day}>
                      <strong>{dayName(day)}</strong>
                      {sub.meals.map((meal) => {
                        const override = sub.overrides.find(
                          (o) => o.day === day && o.meal === meal,
                        );
                        const options = sub.menu.filter((m) => m.meal === meal);
                        return (
                          <label key={meal}>
                            <span>{label(meals, meal)}</span>
                            <select
                              aria-label={`${label(meals, meal)} ${dayName(day)}`}
                              value={override?.itemId ?? ""}
                              onChange={(e) =>
                                put(
                                  {
                                    kind: "day",
                                    id: sub.id,
                                    day,
                                    meal,
                                    itemId: e.target.value || null,
                                  },
                                  `تم تعديل ${label(meals, meal)} يوم ${dayName(day)} ✓`,
                                )
                              }
                            >
                              <option value="">
                                {sub.defaults[meal]
                                  ? `الدائم: ${name(sub.defaults[meal])}`
                                  : "الدائم (لم تختره بعد)"}
                              </option>
                              {options.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </AccountShell>
  );
}

type ContractView = {
  id: string;
  number: number;
  familyName: string;
  customerName: string;
  terms: {
    planLabel: string;
    startDate: string;
    endDate: string | null;
    days: number | null;
    mealLabels: string[];
    delivery: boolean;
    location: string | null;
    notes: string;
  };
  transcript: { side: string; sender: string; body: string; at: string }[];
  customerAgreedAt: string;
  familyAgreedAt: string;
  contentHash: string;
};
const when = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(at));

/** عقد الاشتراك: ثابت للطرفين والإدارة، للاطلاع والطباعة فقط. */
export function ContractPage({ id }: { id: string }) {
  const session = useSession();
  const [contract, setContract] = useState<ContractView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session.user) return;
    api<{ contract: ContractView }>(
      `/api/subscriptions/contracts/${encodeURIComponent(id)}`,
    )
      .then((d) => setContract(d.contract))
      .catch((e) => setError((e as Error).message));
  }, [session.user?.id, id]);
  return (
    <AccountShell navigation={false}>
      <Guard {...session} />
      <Message error={error} />
      {contract && (
        <article className="contract" aria-label="عقد الاشتراك">
          <h1>عقد اشتراك رقم {contract.number}</h1>
          <p className="contract-lock">
            🔒 عقد محفوظ: لا يمكن تعديله ولا حذفه.
          </p>
          <dl>
            <dt>الأسرة المنتجة</dt>
            <dd>{contract.familyName}</dd>
            <dt>العميل</dt>
            <dd>{contract.customerName}</dd>
            <dt>نوع الاشتراك</dt>
            <dd>
              {contract.terms.planLabel}
              {contract.terms.days ? ` (${contract.terms.days} يوم)` : ""}
            </dd>
            <dt>المدة</dt>
            <dd>
              من <bdi>{contract.terms.startDate}</bdi>
              {contract.terms.endDate ? (
                <>
                  {" "}
                  إلى <bdi>{contract.terms.endDate}</bdi>
                </>
              ) : (
                " (مستمر)"
              )}
            </dd>
            <dt>الوجبات</dt>
            <dd>{contract.terms.mealLabels.join("، ")}</dd>
            <dt>التسليم</dt>
            <dd>
              {contract.terms.delivery
                ? `توصيل${contract.terms.location ? ` إلى: ${contract.terms.location}` : ""}`
                : "استلام من الأسرة"}
            </dd>
            {contract.terms.notes && (
              <>
                <dt>ملاحظات</dt>
                <dd>{contract.terms.notes}</dd>
              </>
            )}
            <dt>موافقة العميل</dt>
            <dd>{when(contract.customerAgreedAt)}</dd>
            <dt>موافقة الأسرة</dt>
            <dd>{when(contract.familyAgreedAt)}</dd>
          </dl>
          <h2>نسخة المحادثة عند الاتفاق</h2>
          <ol className="contract-transcript">
            {contract.transcript.map((m, i) => (
              <li key={i} className={m.side}>
                <strong>{m.sender}</strong> <small>{when(m.at)}</small>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
          <p className="contract-hash">
            بصمة العقد: <bdi dir="ltr">{contract.contentHash}</bdi>
          </p>
          <button
            type="button"
            className="button secondary no-print"
            onClick={() => window.print()}
          >
            طباعة العقد
          </button>
        </article>
      )}
    </AccountShell>
  );
}

/** الإدارة ← «عقود الاشتراكات»: كل العقود الثابتة، ولكل عقد صفحته. */
export function ContractsAdmin() {
  const [list, setList] = useState<
    | {
        id: string;
        number: number;
        familyName: string;
        customerName: string;
        plan: string;
        startDate: string;
        familyAgreedAt: string;
      }[]
    | null
  >(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ contracts: NonNullable<typeof list> }>("/api/admin/contracts")
      .then((d) => setList(d.contracts))
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <section aria-label="عقود الاشتراكات">
      <h2>عقود الاشتراكات</h2>
      <p className={s.muted}>
        يُحفظ العقد حين يضغط العميل «تم الاتفاق مع الأسرة» وتوافق الأسرة، ومعه
        نسخة المحادثة. العقود ثابتة: لا تُعدَّل ولا تُحذف.
      </p>
      <Message error={error} />
      {list === null && !error ? (
        <p role="status">جارٍ تحميل العقود…</p>
      ) : list?.length ? (
        <ul className={s.courierList}>
          {list.map((k) => (
            <li key={k.id} className={s.card}>
              <h3>عقد رقم {k.number}</h3>
              <p>
                {k.familyName} ← {k.customerName}
              </p>
              <p>
                {k.plan} · يبدأ <bdi>{k.startDate}</bdi> · وُقّع{" "}
                {when(k.familyAgreedAt)}
              </p>
              <Link href={`/contracts/${encodeURIComponent(k.id)}`}>
                عرض العقد ←
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.notice}>لا توجد عقود اشتراك بعد.</p>
      )}
    </section>
  );
}
