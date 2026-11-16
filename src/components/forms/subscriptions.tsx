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
};

/** لوحة الأسرة ← «الاشتراكات»: ما تتيحه من أنواع ووجبات وتوصيل، والطلبات الواردة. */
export function FamilySubscriptions() {
  const session = useSession();
  const [data, setData] = useState<{
    plan: Plan;
    approved: boolean;
    familyDelivers: boolean;
    requests: IncomingRequest[];
  } | null>(null);
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
