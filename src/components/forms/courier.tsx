"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { City } from "@/lib/types";
import { LocationFields } from "@/components/public/location-fields";
import {
  AccountShell,
  Guard,
  LoginForm,
  Message,
  api,
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

/** لوحة المندوب: تسجيله وبياناته (الاسم الحقيقي، الهوية رقمًا وصورة، نوع السيارة، مدينة العمل). */
export function CourierPanel() {
  const session = useSession();
  const [courier, setCourier] = useState<Courier | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  async function load() {
    const d = await api<{ courier: Courier | null; cities: City[] }>(
      "/api/courier/profile",
    );
    setCourier(d.courier);
    setCities(d.cities);
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
          <p className={s.familyStatusHead}>
            حالة الحساب: <strong>{statusText[courier.status][0]}</strong>
          </p>
          <p>{statusText[courier.status][1]}</p>
          {courier.reviewReason && (
            <p className={s.familyStatusReason}>
              ملاحظة الإدارة: {courier.reviewReason}
            </p>
          )}
          <Link href="/messages">المحادثات مع الأسر ←</Link>
        </section>
      )}
      <Message error={error} success={success} />
      {session.user && loaded && (
        <form className={`${s.form} ${s.card}`} onSubmit={save}>
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
};
const intl = (phone: string) => phone.replace(/^\+/, "");

/** «المندوبين» للأسر المنتجة: حسب المدينة، مع محادثة واتصال وواتساب. */
export function CouriersDirectory() {
  const session = useSession();
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
      .then((d) => {
        setCities(d.cities);
        const mine = d.cities.find((c) => c.id === d.profile?.cityId);
        if (mine) {
          setRegion(mine.regionId);
          setCity(mine.id);
        }
      })
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
      <p className={s.muted}>
        مندوبون معتمدون يتفقون معك على توصيل طلبات زبائنك. الاتفاق والأجرة بينك
        وبين المندوب.
      </p>
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
        <p className={s.notice}>لا يوجد مندوبون معتمدون في هذا النطاق بعد.</p>
      ) : (
        <ul className={s.courierList} aria-label="قائمة المندوبين">
          {list?.map((k) => (
            <li key={k.id} className={s.card}>
              <h2>{k.name}</h2>
              <p>
                🚗 {k.carType} · {k.cityName}
              </p>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.button}
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
                    href={`https://wa.me/${intl(k.whatsapp)}?text=${encodeURIComponent("السلام عليكم، أنا من أسرة منتجة في أكلات جدتنا، أرغب بالاتفاق على توصيل طلبات.")}`}
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
            <p>
              <bdi dir="ltr">{k.phone}</bdi> · {k.cityName} · 🚗 {k.carType}
            </p>
            <p>
              رقم الهوية (خاص): <bdi>{k.nationalId}</bdi>
            </p>
            {k.documentId && (
              <a
                href={`/api/documents/${encodeURIComponent(k.documentId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                عرض صورة الهوية
              </a>
            )}
            {k.reviewReason && <p>آخر ملاحظة: {k.reviewReason}</p>}
            <form className={s.form} onSubmit={(e) => decide(k.id, e)}>
              <label className={s.field}>
                <span className="sr-only">قرار المندوب</span>
                <select name="decision" required defaultValue="">
                  <option value="" disabled>
                    اختر القرار
                  </option>
                  <option value="approved">اعتماد المندوب</option>
                  <option value="rejected">طلب استكمال النواقص</option>
                  <option value="suspended">إيقاف</option>
                </select>
              </label>
              <label className={s.field}>
                ملاحظة للمندوب (تظهر له)
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <button className={s.button}>حفظ قرار المندوب</button>
            </form>
          </article>
        ))
      )}
    </section>
  );
}
