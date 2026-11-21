"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { City } from "@/lib/types";
import { LocationFields } from "@/components/public/location-fields";
import { LocationLink } from "./location-share";
import { OrderChatButton } from "./chat";
import { collectIssues, FormIssues, type FormIssue } from "./form-issues";
import { Stars } from "@/components/public/stars";
import {
  AccountShell,
  Guard,
  LoginForm,
  Message,
  api,
  isFamilyAccount,
  s,
  useSession,
} from "./shared";

type Courier = {
  id: string;
  name: string;
  cityId: string;
  regionId: string;
  carType: string;
  documentId: string | null;
  nationalId: string;
  showPhone: boolean;
  showWhatsapp: boolean;
  status: "pending" | "approved" | "rejected" | "suspended";
  reviewReason: string | null;
  active: boolean;
  cityPrice: number | null;
  centers: { nodeId: string; price: number | null }[];
  /** المندوب الخاص: اسم الأسرة التي سجّلته؛ null للمندوب العام. */
  familyName: string | null;
};
type CenterOption = { cityId: string; id: string; name: string };
const toPrice = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "")
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return t === "" ? null : Number(t);
};
const statusText: Record<Courier["status"], [string, string]> = {
  pending: [
    "تحت المراجعة",
    "تم استلام بياناتك، وتظهر للأسر المنتجة بعد اعتماد الإدارة.",
  ],
  approved: [
    "معتمد",
    "حسابك معتمد، وتظهر للأسر المنتجة في «المندوبين» بمدينتك.",
  ],
  rejected: [
    "بانتظار إكمال المطلوب",
    "راجعت الإدارة بياناتك وتحتاج استكمالًا. عدّلها واحفظها لتعود للمراجعة.",
  ],
  suspended: ["موقوف", "الحساب موقوف مؤقتًا ولا يظهر للأسر. تواصل مع الإدارة."],
};

/** شارة المندوب الخاص بأسرة. */
export function PrivateCourierBadge({ family }: { family: string }) {
  return <span className={s.privateCourier}>مندوب خاص لـ {family}</span>;
}

/** لوحة المندوب: تسجيله وبياناته (الاسم الحقيقي، الهوية رقمًا وصورة، نوع السيارة، مدينة العمل). */
export function CourierPanel() {
  const session = useSession();
  const [courier, setCourier] = useState<Courier | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [city, setCity] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  async function load() {
    const d = await api<{
      courier: Courier | null;
      cities: City[];
      centers: CenterOption[];
    }>("/api/courier/profile");
    setCourier(d.courier);
    setCities(d.cities);
    setCenters(d.centers ?? []);
    setCity(d.courier?.cityId ?? "");
  }
  useEffect(() => {
    if (!session.user) return;
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [session.user?.id]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    // النواقص كلها في رسالة واحدة واضحة قبل الإرسال.
    const found = collectIssues(e.currentTarget);
    setIssues(found);
    if (found.length) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      let documentId = courier?.documentId ?? "";
      const file = f.get("idImage");
      if (file instanceof File && file.size) {
        if (
          file.size > 10 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
        )
          throw Error("صورة الهوية JPEG أو PNG أو PDF حتى 10 ميجابايت.");
        if (uploaded.current?.file === file) documentId = uploaded.current.id;
        else {
          const form = new FormData();
          form.set("file", file);
          form.set("type", "national_id");
          const d = await api<{ id: string }>("/api/documents", {
            method: "POST",
            body: form,
          });
          documentId = d.id;
          uploaded.current = { file, id: d.id };
        }
      }
      if (!documentId) throw Error("أرفق صورة الهوية.");
      const r = await api<{ status: Courier["status"] }>(
        "/api/courier/profile",
        {
          method: "POST",
          body: JSON.stringify({
            name: f.get("name"),
            nationalId: f.get("nationalId"),
            documentId,
            carType: f.get("carType"),
            cityId: f.get("cityId"),
            showPhone: f.has("showPhone"),
            showWhatsapp: f.has("showWhatsapp"),
            cityPrice: toPrice(f.get("cityPrice")),
            centers: cityCenters
              .filter((c) => f.has("center:" + c.id))
              .map((c) => ({
                nodeId: c.id,
                price: toPrice(f.get("centerPrice:" + c.id)),
              })),
          }),
        },
      );
      await load();
      setSuccess(
        r.status === "approved"
          ? "تم حفظ بياناتك ✓"
          : "تم حفظ بياناتك ✓ وطلبك الآن تحت المراجعة.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const cityCenters = centers.filter((c) => c.cityId === city);
  const savedCenter = (id: string) =>
    courier?.centers?.find((c) => c.nodeId === id);
  async function toggleActive() {
    if (!courier) return;
    setError("");
    try {
      const r = await api<{ active: boolean }>("/api/courier/active", {
        method: "PUT",
        body: JSON.stringify({ active: !courier.active }),
      });
      setCourier({ ...courier, active: r.active });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  if (session.ready && !session.user)
    return (
      <AccountShell>
        <h1>التسجيل مندوبًا</h1>
        <p className={s.muted}>
          سجّل برقم جوالك أولًا، ثم أكمل بياناتك هنا. اختر «مندوب توصيل للأسر
          المنتجة» عند إنشاء الحساب.
        </p>
        <LoginForm register onVerified={() => window.location.reload()} />
      </AccountShell>
    );
  return (
    <AccountShell>
      <h1>لوحة المندوب</h1>
      <Guard {...session} />
      {courier && (
        <section
          className={`${s.card} ${s.familyStatus}`}
          aria-label="حالة حساب المندوب"
        >
          {courier.familyName && (
            <PrivateCourierBadge family={courier.familyName} />
          )}
          <p className={s.familyStatusHead}>
            حالة الحساب: <strong>{statusText[courier.status][0]}</strong>
          </p>
          <p>
            {courier.familyName
              ? courier.status === "approved"
                ? `سجّلتك «${courier.familyName}» مندوبًا خاصًا لها، وتصلك طلبات توصيلها هنا.`
                : `أوقفت «${courier.familyName}» أو الإدارة حسابك مندوبًا خاصًا. تواصل مع الأسرة.`
              : statusText[courier.status][1]}
          </p>
          {courier.reviewReason && (
            <p className={s.familyStatusReason}>
              ملاحظة الإدارة: {courier.reviewReason}
            </p>
          )}
          <p>
            الحالة الآن:{" "}
            <strong>
              {courier.active
                ? courier.familyName
                  ? "نشط — تستطيع الأسرة إسناد الطلبات إليك"
                  : "نشط — يظهر اسمك للأسر"
                : courier.familyName
                  ? "غير نشط — لا تسند إليك الأسرة طلبات الآن"
                  : "غير نشط — اسمك مخفي عن الأسر"}
            </strong>
          </p>
          <div className={s.actions}>
            <button
              type="button"
              className={courier.active ? s.buttonSecondary : s.button}
              onClick={toggleActive}
              aria-pressed={courier.active}
            >
              {courier.active
                ? "إيقاف الظهور (غير نشط)"
                : "أنا متاح الآن (نشط)"}
            </button>
            <Link href="/messages">المحادثات مع الأسر ←</Link>
          </div>
        </section>
      )}
      {courier?.status === "approved" && <CourierDeliveries />}
      <Message error={error} success={success} />
      {session.user && loaded && !courier?.familyName && (
        <form
          className={`${s.form} ${s.card}`}
          onSubmit={save}
          noValidate
          onChange={(e) => {
            const t = e.target as unknown as HTMLSelectElement;
            if (t.name === "cityId") setCity(t.value);
          }}
        >
          <h2>بيانات المندوب</h2>
          <p className={s.muted}>
            رقم الهوية وصورتها للإدارة فقط. يظهر للأسر اسمك ونوع سيارتك ومدينتك
            وطرق التواصل التي تختارها.
          </p>
          <div className={s.grid}>
            <label className={s.field}>
              الاسم الحقيقي
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={courier?.name ?? session.user.name}
              />
            </label>
            <label className={s.field}>
              الجوال
              <input value={session.user.phone} dir="ltr" readOnly />
            </label>
            <label className={s.field}>
              رقم الهوية
              <input
                name="nationalId"
                inputMode="numeric"
                dir="ltr"
                required
                pattern="[0-9٠-٩۰-۹]{10}"
                maxLength={10}
                defaultValue={courier?.nationalId ?? ""}
                autoComplete="off"
              />
            </label>
            <label className={s.field}>
              نوع السيارة
              <input
                name="carType"
                required
                minLength={2}
                maxLength={80}
                placeholder="مثال: كامري 2020"
                defaultValue={courier?.carType ?? ""}
              />
            </label>
          </div>
          <label className={s.field}>
            صورة الهوية
            <input
              name="idImage"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              required={!courier?.documentId}
            />
            <small>
              {courier?.documentId
                ? "صورة الهوية محفوظة؛ أرفق صورة جديدة لتغييرها."
                : "صورة واضحة للهوية، حتى 10 ميجابايت. تراها الإدارة فقط."}
            </small>
          </label>
          {courier?.documentId && (
            <a
              href={`/api/documents/${encodeURIComponent(courier.documentId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              عرض صورة الهوية المحفوظة
            </a>
          )}
          <fieldset>
            <legend>مدينة العمل</legend>
            <div className={s.grid}>
              <LocationFields
                cities={cities}
                defaultCity={courier?.cityId}
                cityName="cityId"
                regionName="regionId"
                required
                className={s.field}
              />
            </div>
          </fieldset>
          <fieldset>
            <legend>تسعيرة التوصيل</legend>
            <label className={s.field}>
              داخل المدينة (سعر واحد للمدينة كلها)
              <input
                name="cityPrice"
                inputMode="decimal"
                dir="ltr"
                pattern="[0-9٠-٩]+(\.[0-9٠-٩]{1,2})?"
                placeholder="فارغ = حسب الاتفاق مع الأسرة"
                defaultValue={courier?.cityPrice ?? ""}
              />
              <small>بالريال. اتركه فارغًا ليظهر «حسب الاتفاق».</small>
            </label>
            {city && cityCenters.length > 0 && (
              <div className={s.courierChoices}>
                <p className={s.muted}>
                  المراكز التابعة للمدينة التي تخدمها، ولكل مركز تسعيرته:
                </p>
                {cityCenters.map((c) => (
                  <div key={c.id} className={s.grid}>
                    <label>
                      <input
                        type="checkbox"
                        name={"center:" + c.id}
                        defaultChecked={!!savedCenter(c.id)}
                      />{" "}
                      {c.name}
                    </label>
                    <label className={s.field}>
                      سعر {c.name}
                      <input
                        name={"centerPrice:" + c.id}
                        inputMode="decimal"
                        dir="ltr"
                        pattern="[0-9٠-٩]+(\.[0-9٠-٩]{1,2})?"
                        placeholder="فارغ = حسب الاتفاق"
                        defaultValue={savedCenter(c.id)?.price ?? ""}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>التواصل الظاهر للأسر</legend>
            <div className={s.checks}>
              <label>
                <input
                  type="checkbox"
                  name="showWhatsapp"
                  defaultChecked={courier?.showWhatsapp ?? true}
                />
                واتساب
              </label>
              <label>
                <input
                  type="checkbox"
                  name="showPhone"
                  defaultChecked={courier?.showPhone ?? true}
                />
                اتصال
              </label>
            </div>
            <small>المحادثة داخل الموقع متاحة دائمًا.</small>
          </fieldset>
          <FormIssues issues={issues} />
          <button className={s.button} disabled={busy}>
            {busy
              ? "جارٍ الحفظ…"
              : courier
                ? "حفظ البيانات"
                : "تسجيل وإرسال للمراجعة"}
          </button>
        </form>
      )}
    </AccountShell>
  );
}

type Card = {
  id: string;
  userId: string;
  name: string;
  carType: string;
  cityName: string;
  regionName: string;
  phone: string | null;
  whatsapp: string | null;
  cityPrice: number | null;
  centers: { name: string; price: number | null }[];
  ratingAverage?: number | null;
  ratingCount?: number;
  familyName?: string | null;
};
const priceText = (v: number | null) =>
  v === null ? "حسب الاتفاق" : `${v} ر.س`;
const intl = (phone: string) => phone.replace(/^\+/, "");

type FamilyCourier = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  carType: string;
  vehicle: "car" | "motorcycle" | null;
  status: Courier["status"];
  active: boolean;
  stoppedByAdmin: boolean;
  joined: boolean;
};

/**
 * «مندوبي الخاص»: الأسرة تسجّل مندوبها بالاسم والجوال ونوع السيارة، بتعهّدها بمعرفته
 * ومسؤوليتها عنه، فيُعتمد فورًا ويظهر لها وحدها في إسناد التوصيل.
 */
function FamilyCouriers() {
  const [data, setData] = useState<{
    familyName: string;
    pledge: string;
    couriers: FamilyCourier[];
  } | null>(null);
  // ليس أسرة معتمدة بعد: يُشرح السبب بدل إخفاء القسم.
  const [unavailable, setUnavailable] = useState("");
  const [vehicle, setVehicle] = useState<"car" | "motorcycle">("car");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<{ familyName: string; pledge: string; couriers: FamilyCourier[] }>(
      "/api/producer/couriers",
    )
      .then(setData)
      .catch((e) => setUnavailable((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const form = e.currentTarget;
    const found = collectIssues(form);
    setIssues(found);
    if (found.length) return;
    const f = new FormData(form);
    setBusy(true);
    try {
      await api("/api/producer/couriers", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          phone: f.get("phone"),
          vehicle,
          ...(vehicle === "car"
            ? { carModel: f.get("carModel"), carColor: f.get("carColor") }
            : {}),
          pledge: f.has("pledge"),
        }),
      });
      form.reset();
      setVehicle("car");
      await load();
      setSuccess(
        "تم تسجيل المندوب ✓ يدخل بجواله من «دخول» ← «نسيت كلمة المرور» أول مرة، فتصله طلبات التوصيل التي تسندها إليه.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop(k: FamilyCourier) {
    if (!window.confirm(`إيقاف المندوب ${k.name}؟`)) return;
    setError("");
    setSuccess("");
    try {
      await api("/api/producer/couriers", {
        method: "PATCH",
        body: JSON.stringify({ id: k.id }),
      });
      await load();
      setSuccess("تم إيقاف المندوب. تعيده بتسجيل جواله مرة أخرى.");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  if (unavailable)
    return (
      <section className={s.card} aria-label="مندوبي الخاص">
        <h2>مندوبي الخاص</h2>
        <p className={s.notice}>
          {unavailable}. تضيف مندوبك الخاص (الاسم والجوال والمركبة) بعد اعتماد
          أسرتك.
        </p>
      </section>
    );
  if (!data) return null;
  return (
    <section className={s.card} aria-label="مندوبي الخاص">
      <h2>مندوبي الخاص</h2>
      <p className={s.muted}>
        سجّل مندوبًا تعرفه شخصيًا ليوصل طلبات «{data.familyName}». يُعتمد فورًا
        دون انتظار الإدارة، ويظهر لأسرتك فقط في إسناد التوصيل.
      </p>
      <Message error={error} success={success} />
      {data.couriers.length > 0 && (
        <ul className={s.courierList} aria-label="مندوبو الأسرة الخاصون">
          {data.couriers.map((k) => (
            <li key={k.id} className={s.card}>
              <h3>{k.name}</h3>
              <PrivateCourierBadge family={data.familyName} />
              <p>
                <bdi dir="ltr">{k.phone}</bdi> ·{" "}
                {k.vehicle === "motorcycle" ? "🛵" : "🚗"} {k.carType}
              </p>
              <p>
                {k.status === "approved"
                  ? k.active
                    ? "✅ نشط — تسند إليه طلبات التوصيل"
                    : "⏸️ أوقف ظهوره مؤقتًا من حسابه"
                  : k.stoppedByAdmin
                    ? "⛔ أوقفته الإدارة"
                    : "⛔ موقوف"}
                {k.status === "approved" && !k.joined && (
                  <small className={s.muted}>
                    {" "}
                    · لم يدخل بعد: يدخل بجواله من «نسيت كلمة المرور» أول مرة.
                  </small>
                )}
              </p>
              {k.status === "approved" && (
                <button
                  type="button"
                  className={s.buttonSecondary}
                  onClick={() => stop(k)}
                >
                  إيقاف المندوب
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className={s.form} onSubmit={add} noValidate>
        <h3>تسجيل مندوب خاص</h3>
        <div className={s.grid}>
          <label className={s.field}>
            اسم المندوب
            <input name="name" required minLength={2} maxLength={120} />
          </label>
          <label className={s.field}>
            جوال المندوب
            <input
              name="phone"
              required
              inputMode="tel"
              dir="ltr"
              maxLength={40}
              placeholder="05xxxxxxxx"
              autoComplete="off"
            />
          </label>
        </div>
        <fieldset className={s.vehicleChoice}>
          <legend>المركبة</legend>
          {(
            [
              ["car", "🚗 سيارة"],
              ["motorcycle", "🛵 دباب"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="vehicle"
                value={id}
                checked={vehicle === id}
                onChange={() => setVehicle(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {vehicle === "car" && (
          <div className={s.grid}>
            <label className={s.field}>
              نوع السيارة
              <input
                name="carModel"
                required
                minLength={2}
                maxLength={60}
                placeholder="مثال: كامري 2020"
              />
            </label>
            <label className={s.field}>
              لون السيارة
              <input
                name="carColor"
                required
                minLength={2}
                maxLength={30}
                placeholder="مثال: أبيض"
              />
            </label>
          </div>
        )}
        <label className={s.pledge}>
          <input
            type="checkbox"
            name="pledge"
            required
            data-label="التعهد بمعرفة المندوب"
            data-reason="يلزم الإقرار بالتعهد"
          />
          <span>
            <strong>تعهّد:</strong> {data.pledge}
          </span>
        </label>
        <FormIssues issues={issues} />
        <button className={s.button} disabled={busy}>
          {busy ? "جارٍ التسجيل…" : "تسجيل المندوب الخاص"}
        </button>
      </form>
    </section>
  );
}

/** صفحة «مندوبي الخاص» في لوحة الأسرة. */
export function FamilyCouriersPage() {
  const session = useSession();
  return (
    <AccountShell>
      <h1>مندوبي الخاص</h1>
      <Guard {...session} />
      {session.user && <FamilyCouriers />}
      <p>
        <Link href="/couriers">المندوبون المعتمدون في مدينتك ←</Link>
      </p>
    </AccountShell>
  );
}

/**
 * «تجمع المندوبين»: الأسرة ترى مندوبها الخاص والعامين في تغطيتها، والعميل يرى العامين فقط
 * ويتفق مع أحدهم. وإن جاء العميل من طلبه (?order=) يختار المندوب لتوصيله مباشرة.
 */
export function CouriersDirectory() {
  const session = useSession();
  const family = isFamilyAccount(session.user);
  const [orderId, setOrderId] = useState("");
  const [chosen, setChosen] = useState("");
  useEffect(() => {
    setOrderId(new URLSearchParams(window.location.search).get("order") ?? "");
  }, []);
  const [cities, setCities] = useState<City[]>([]);
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [list, setList] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!session.user) return;
    api<{
      cities: City[];
      profile: { cityId?: string } | null;
    }>("/api/producer/profile")
      // القائمة محصورة أصلًا في تغطية الأسرة (المدينة ومراكزها)؛ التصفية اختيارية.
      .then((d) => setCities(d.cities))
      .catch(() => {});
  }, [session.user?.id]);
  useEffect(() => {
    if (!session.user) return;
    const q = new URLSearchParams();
    if (city) q.set("city", city);
    else if (region) q.set("region", region);
    api<{ couriers: Card[] }>(`/api/couriers?${q}`)
      .then((d) => {
        setList(d.couriers);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [session.user?.id, city, region]);
  async function choose(courier: Card) {
    setBusy(courier.id);
    setError("");
    try {
      const d = await api<{ courierName: string }>("/api/orders/courier", {
        method: "PUT",
        body: JSON.stringify({ orderId, courierUserId: courier.userId }),
      });
      setChosen(d.courierName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function chat(courier: Card) {
    setBusy(courier.id);
    try {
      const d = await api<{ id: string }>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ courier: courier.userId }),
      });
      window.location.assign(`/messages?c=${encodeURIComponent(d.id)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  const regions = [
    ...new Map(cities.map((c) => [c.regionId, c.regionName])).entries(),
  ];
  return (
    <AccountShell>
      <h1>المندوبون</h1>
      <Guard {...session} />
      {session.user && family && <FamilyCouriers />}
      {family ? (
        <p className={s.muted}>
          مندوبون معتمدون ونشطون الآن داخل تغطيتك (المدينة أو المراكز). الاتفاق
          والأجرة بينك وبين المندوب.
        </p>
      ) : (
        <p className={s.muted}>
          مندوبون معتمدون ونشطون الآن. إن لم تتفق مع الأسرة على التوصيل، اختر
          مندوبًا في مدينتك واتفق معه. الاتفاق والأجرة بينك وبين المندوب.
        </p>
      )}
      {!family && orderId && !chosen && (
        <p className={s.notice}>
          تختار الآن مندوبًا لتوصيل طلبك: اضغط «اختره لتوصيل طلبي» على المندوب
          المناسب.
        </p>
      )}
      {chosen && (
        <p role="status" className={s.notice}>
          تم ✓ اخترت {chosen} لتوصيل طلبك، ووصله إشعار، وعرفت الأسرة أنه سيستلم
          منها. <Link href="/orders">العودة إلى طلباتي ←</Link>
        </p>
      )}
      <div className={s.grid}>
        <label className={s.field}>
          المنطقة
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setCity("");
            }}
          >
            <option value="">كل المناطق</option>
            {regions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          المدينة
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">كل المدن</option>
            {cities
              .filter((c) => !region || c.regionId === region)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <Message error={error} />
      {list === null && !error ? (
        <p role="status">جارٍ تحميل المندوبين…</p>
      ) : list && list.length === 0 ? (
        <p className={s.notice}>
          {family
            ? "لا يوجد مندوب نشط في تغطيتك الآن."
            : "لا يوجد مندوب نشط في هذه المنطقة الآن."}
        </p>
      ) : (
        <ul className={s.courierList} aria-label="قائمة المندوبين">
          {list?.map((k) => (
            <li key={k.id} className={s.card}>
              <h2>{k.name}</h2>
              {k.familyName && <PrivateCourierBadge family={k.familyName} />}
              <Stars
                value={k.ratingAverage ?? null}
                count={k.ratingCount ?? 0}
                size={14}
              />
              <p>
                🚗 {k.carType} · {k.cityName}
              </p>
              <ul className={s.courierPrices} aria-label={"تسعيرة " + k.name}>
                <li>
                  داخل المدينة:{" "}
                  <strong>{priceText(k.cityPrice ?? null)}</strong>
                </li>
                {(k.centers ?? []).map((x) => (
                  <li key={x.name}>
                    {x.name}: <strong>{priceText(x.price)}</strong>
                  </li>
                ))}
              </ul>
              <div className={s.actions}>
                {!family && orderId && !chosen && (
                  <button
                    type="button"
                    className={s.button}
                    disabled={busy === k.id}
                    onClick={() => choose(k)}
                  >
                    اختره لتوصيل طلبي
                  </button>
                )}
                <button
                  type="button"
                  className={family || !orderId ? s.button : s.buttonSecondary}
                  disabled={busy === k.id}
                  onClick={() => chat(k)}
                >
                  محادثة
                </button>
                {k.phone && (
                  <a className={s.contact} href={`tel:+${intl(k.phone)}`}>
                    اتصال
                  </a>
                )}
                {k.whatsapp && (
                  <a
                    className={s.contact}
                    href={`https://wa.me/${intl(k.whatsapp)}?text=${encodeURIComponent(family ? "السلام عليكم، أنا من أسرة منتجة في أكلات جدتنا، أرغب بالاتفاق على توصيل طلبات." : "السلام عليكم، أنا عميل في أكلات جدتنا، أرغب بالاتفاق على توصيل طلبي.")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    واتساب
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

type AdminCourier = {
  id: string;
  name: string;
  phone: string;
  carType: string;
  cityName: string;
  documentId: string | null;
  nationalId: string;
  status: Courier["status"];
  reviewReason: string | null;
  familyName: string | null;
};

/** الإدارة: اعتماد المندوبين (رقم الهوية وصورتها للمراجعة فقط). */
export function AdminCouriers({
  onChanged,
  onlyPending = true,
}: {
  onChanged?: () => void;
  onlyPending?: boolean;
}) {
  const [list, setList] = useState<AdminCourier[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = () =>
    api<{ couriers: AdminCourier[] }>("/api/admin/couriers")
      .then((d) => setList(d.couriers))
      .catch((e) => {
        setList([]);
        setError((e as Error).message);
      });
  useEffect(() => {
    load();
  }, []);
  const shown = (list ?? []).filter(
    (k) => !onlyPending || k.status === "pending",
  );
  async function decide(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    setSuccess("");
    try {
      await api(`/api/admin/couriers/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({
          decision: f.get("decision"),
          reason: f.get("reason"),
        }),
      });
      setSuccess("تم حفظ قرار المندوب.");
      await load();
      onChanged?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section aria-label="اعتماد المندوبين">
      <h2>المندوبون</h2>
      <Message error={error} success={success} />
      {list === null ? (
        <p role="status">جارٍ تحميل المندوبين…</p>
      ) : shown.length === 0 ? (
        <p className={s.notice}>
          {onlyPending
            ? "لا يوجد مندوبون ينتظرون الاعتماد الآن."
            : "لا يوجد مندوبون بعد."}
        </p>
      ) : (
        shown.map((k) => (
          <article key={k.id} className={s.card}>
            <h3>{k.name}</h3>
            {k.familyName && <PrivateCourierBadge family={k.familyName} />}
            <p>
              <bdi dir="ltr">{k.phone}</bdi> · {k.cityName} · 🚗 {k.carType}
            </p>
            {k.familyName ? (
              <p>سجّلته الأسرة بتعهّدها بمعرفته ومسؤوليتها عنه، دون هوية.</p>
            ) : (
              <p>
                رقم الهوية (خاص): <bdi>{k.nationalId}</bdi>
              </p>
            )}
            {k.documentId && (
              <a
                href={`/api/documents/${encodeURIComponent(k.documentId)}`}
                target="_blank"
                rel="noopener"
              >
                عرض صورة الهوية
              </a>
            )}
            {k.reviewReason && <p>آخر ملاحظة: {k.reviewReason}</p>}
            <form className={s.form} onSubmit={(e) => decide(k.id, e)}>
              <CourierDecisionFields />
              <button className={s.button}>حفظ قرار المندوب</button>
            </form>
          </article>
        ))
      )}
    </section>
  );
}

type Delivery = {
  orderId: string;
  status: "assigned" | "delivered";
  product: string | null;
  quantity: number;
  startDate: string;
  family: string;
  familyPhone: string;
  pickupLocation: string;
  customerName: string;
  customerPhone: string;
  deliveryLocation: string | null;
  /** اختاره العميل من «تجمع المندوبين» (لا الأسرة). */
  byCustomer?: boolean;
};
/** «طلبات التوصيل»: موقع الأسرة لاستلام الطلب وموقع العميل لتوصيله. */
function CourierDeliveries() {
  const [list, setList] = useState<Delivery[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const load = () =>
    api<{ deliveries: Delivery[] }>("/api/courier/deliveries")
      .then((d) => setList(d.deliveries))
      .catch((e) => {
        setList([]);
        setError((e as Error).message);
      });
  useEffect(() => {
    load();
  }, []);
  async function delivered(id: string) {
    if (!window.confirm("تأكيد توصيل الطلب للعميل؟")) return;
    setBusy(id);
    setError("");
    try {
      await api("/api/courier/deliveries", {
        method: "PUT",
        body: JSON.stringify({ orderId: id }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className={s.card} aria-label="طلبات التوصيل">
      <h2>طلبات التوصيل</h2>
      <Message error={error} />
      {list === null ? (
        <p role="status">جارٍ التحميل…</p>
      ) : list.length === 0 ? (
        <p className={s.muted}>لا توجد طلبات توصيل مسندة إليك الآن.</p>
      ) : (
        list.map((d) => (
          <article key={d.orderId} className={s.courierAssign}>
            <h3>
              {d.product ?? "طلب"} — {d.quantity}
              {d.status === "delivered" ? " · تم التوصيل ✓" : ""}
            </h3>
            <p className={s.muted}>
              {d.byCustomer
                ? "اختارك العميل لتوصيل طلبه: اتفق معه على الأجرة، واستلم من الأسرة."
                : "أسندت إليك الأسرة هذا التوصيل."}
            </p>
            <p>
              الأسرة: {d.family}{" "}
              <a className={s.contact} href={`tel:${d.familyPhone}`}>
                اتصال بالأسرة
              </a>
            </p>
            <LocationLink
              label="موقع الاستلام (الأسرة)"
              location={d.pickupLocation}
            />
            <p>
              العميل: {d.customerName}{" "}
              <a className={s.contact} href={`tel:${d.customerPhone}`}>
                اتصال بالعميل
              </a>{" "}
              <OrderChatButton
                orderId={d.orderId}
                courier
                label="مراسلة العميل"
                className={s.contact}
              />
            </p>
            {d.deliveryLocation ? (
              <LocationLink
                label="موقع التوصيل (العميل)"
                location={d.deliveryLocation}
              />
            ) : (
              <p className={s.muted}>لم يرسل العميل موقعه؛ تواصل معه.</p>
            )}
            {d.status === "assigned" && (
              <button
                type="button"
                className={s.button}
                disabled={busy === d.orderId}
                onClick={() => delivered(d.orderId)}
              >
                تم التوصيل
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}

/** القرار والملاحظة: الملاحظة اختيارية عند الاعتماد، ومطلوبة عند طلب الاستكمال أو الإيقاف. */
function CourierDecisionFields() {
  const [decision, setDecision] = useState("");
  const approve = decision === "approved";
  return (
    <>
      <label className={s.field}>
        <span className="sr-only">قرار المندوب</span>
        <select
          name="decision"
          required
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
        >
          <option value="" disabled>
            اختر القرار
          </option>
          <option value="approved">اعتماد المندوب</option>
          <option value="rejected">طلب استكمال النواقص</option>
          <option value="suspended">إيقاف</option>
        </select>
      </label>
      <label className={s.field}>
        {approve
          ? "ملاحظة للمندوب (اختيارية عند الاعتماد؛ تظهر له)"
          : "ملاحظة للمندوب (مطلوبة: اذكر النواقص أو سبب القرار؛ تظهر له)"}
        <textarea
          name="reason"
          required={!approve}
          minLength={approve ? undefined : 5}
          maxLength={2000}
        />
      </label>
    </>
  );
}
