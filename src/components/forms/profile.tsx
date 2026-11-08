"use client";
import { LocationFields } from "@/components/public/location-fields";
import { useEffect, useState } from "react";
import type { Category, City, SessionUser } from "@/lib/types";
import {
  AdvancedFields,
  advancedPayload,
  type AdvancedProfile,
} from "./profile-advanced";
import {
  AccountShell,
  Guard,
  LoginForm,
  Message,
  api,
  s,
  useSession,
} from "./shared";
type Profile = AdvancedProfile & {
  name: string;
  description?: string;
  cityId: string;
  neighborhood?: string;
  phone: string;
  whatsapp?: string;
  delivery: boolean;
  pickup: boolean;
  categoryIds: string[];
  documentType?: string;
  documentId?: string;
  documentNumber?: string;
  documentExpiresAt?: string;
  status?: string;
  reviewReason?: string;
};
const documentTypes = [
  ["commercial_registration", "سجل تجاري"],
  ["freelance", "وثيقة عمل حر"],
  ["producer_certificate", "شهادة أسرة منتجة"],
  ["national_id", "هوية وطنية للمراجعة فقط"],
  ["other_document", "مستند أهلية آخر للمراجعة"],
  ["exception", "طلب استثناء إداري"],
];
export function ProfileForm({
  registration = false,
}: {
  registration?: boolean;
}) {
  const session = useSession();
  const [verified, setVerified] = useState<SessionUser | null>(null);
  const user = verified || session.user;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(registration ? 1 : 2);
  const [documentId, setDocumentId] = useState("");
  const [documentType, setDocumentType] = useState("commercial_registration");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    if (!user) return;
    api<{ profile: Profile | null; categories: Category[]; cities: City[] }>(
      "/api/producer/profile",
    )
      .then((d) => {
        setProfile(d.profile);
        setCategories(d.categories);
        setCities(d.cities);
        if (d.profile?.documentId) setDocumentId(d.profile.documentId);
        if (d.profile?.documentType) setDocumentType(d.profile.documentType);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [user]);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    if (documentType === "exception") {
      setDocumentId("");
      setStep(2);
      setBusy(false);
      return;
    }
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("اختر مستند الأهلية.");
      setBusy(false);
      return;
    }
    if (
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    ) {
      setError("المستند يجب أن يكون PDF أو JPEG أو PNG وبحد أقصى 10 ميجابايت.");
      setBusy(false);
      return;
    }
    f.set("type", documentType);
    try {
      const d = await api<{ id: string }>("/api/documents", {
        method: "POST",
        body: f,
      });
      setDocumentId(d.id);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const f = new FormData(e.currentTarget);
    const categoryIds = f.getAll("categoryIds").map(String);
    if (!categoryIds.length) {
      setError("اختر تصنيفًا واحدًا على الأقل.");
      return;
    }
    if (!f.has("delivery") && !f.has("pickup")) {
      setError("اختر التوصيل أو الاستلام على الأقل.");
      return;
    }
    let advanced: ReturnType<typeof advancedPayload>;
    try {
      advanced = advancedPayload(f);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      await api("/api/producer/profile", {
        method: "POST",
        body: JSON.stringify({
          ...advanced,
          name: f.get("name"),
          description: f.get("description"),
          cityId: f.get("cityId"),
          neighborhood: f.get("neighborhood"),
          phone: f.get("phone"),
          whatsapp: f.get("whatsapp"),
          delivery: f.has("delivery"),
          pickup: f.has("pickup"),
          categoryIds,
          documentType,
          documentId: documentId || null,
          exceptionReason: f.get("exceptionReason") || null,
          documentNumber: f.get("documentNumber") || null,
          documentExpiresAt: f.get("documentExpiresAt") || null,
        }),
      });
      setSuccess(
        "تم حفظ بيانات الأسرة وإرسالها للمراجعة. لا يبدأ النشر قبل اعتماد الإدارة.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!session.ready) return <p role="status">جارٍ تحميل الحساب…</p>;
  if (!user)
    return registration ? (
      <LoginForm register onVerified={setVerified} />
    ) : (
      <Guard {...session} />
    );
  return (
    <>
      <h1>{registration ? "سجّل أسرتك المنتجة" : "بيانات الأسرة"}</h1>
      <p className={s.muted}>
        حضور يليق بصنعة يدك. التسجيل مجاني، والبيع متاح للأسر المؤهلة بعد
        المراجعة.
      </p>
      <Message error={error} success={success} />
      {profile?.status && (
        <p className={s.notice}>
          حالة الطلب:{" "}
          {(
            {
              pending: "قيد المراجعة",
              approved: "معتمد",
              rejected: "مرفوض",
              suspended: "معلق",
            } as Record<string, string>
          )[profile.status] || profile.status}
          {profile.reviewReason && ` — ${profile.reviewReason}`}
        </p>
      )}
      {registration && (
        <p className={s.tag}>
          الخطوة {step + 1} من 3 ·{" "}
          {step === 1 ? "إثبات الأهلية" : "بيانات الأسرة"}
        </p>
      )}
      {!loaded ? (
        <p role="status">جارٍ تحميل البيانات…</p>
      ) : step === 1 ? (
        <form className={`${s.form} ${s.card}`} onSubmit={upload}>
          <h2>إثبات أهلية التسجيل</h2>
          <p className={s.notice}>
            تحفظ المستندات بصورة خاصة. الهوية الوطنية ليست ترخيصًا لمزاولة
            النشاط، والاستثناء الإداري لا يعفي من أي ترخيص إلزامي.
          </p>
          <label className={s.field}>
            <span className="sr-only">نوع المستند</span>
            <select
              value={documentType}
              onChange={(e) => {
                setDocumentType(e.target.value);
                setDocumentId("");
              }}
            >
              <option value="" disabled>
                اختر نوع المستند
              </option>
              {documentTypes.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {documentType !== "exception" && (
            <label className={s.field}>
              المستند الخاص · حتى 10 ميجابايت
              <input
                name="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                required
              />
            </label>
          )}
          <button disabled={busy || !session.open} className={s.button}>
            {busy
              ? "جارٍ المتابعة…"
              : documentType === "exception"
                ? "متابعة طلب الاستثناء"
                : "رفع المستند ومتابعة"}
          </button>
        </form>
      ) : (
        <form
          key={profile?.name || "new"}
          className={`${s.form} ${s.card}`}
          onSubmit={save}
        >
          {documentType === "exception" && (
            <label className={s.field}>
              سبب طلب الاستثناء الإداري
              <textarea
                name="exceptionReason"
                required
                minLength={10}
                maxLength={2000}
                defaultValue={profile?.reviewReason || ""}
              />
              <small>
                يظل الملف قيد المراجعة حتى موافقة الإدارة؛ اختيار الاستثناء لا
                يعني اعتماده.
              </small>
            </label>
          )}
          <div className={s.grid}>
            <label className={s.field}>
              رقم المستند (إن وجد)
              <input
                name="documentNumber"
                maxLength={100}
                defaultValue={profile?.documentNumber}
              />
            </label>
            <label className={s.field}>
              تاريخ انتهاء المستند (إن وجد)
              <input
                name="documentExpiresAt"
                type="date"
                defaultValue={profile?.documentExpiresAt?.slice(0, 10)}
              />
            </label>
            <label className={s.field}>
              اسم الأسرة أو الاسم التجاري
              <input
                name="name"
                defaultValue={profile?.name}
                required
                maxLength={120}
              />
            </label>
            <LocationFields
              cities={cities}
              defaultCity={profile?.cityId}
              cityName="cityId"
              regionName="regionId"
              required
              className={s.field}
            />
            <label className={s.field}>
              الحي (اختياري)
              <input
                name="neighborhood"
                defaultValue={profile?.neighborhood}
                maxLength={120}
              />
            </label>
            <label className={s.field}>
              رقم التواصل العام
              <input
                type="tel"
                dir="ltr"
                name="phone"
                defaultValue={profile?.phone || user.phone}
                required
              />
            </label>
            <label className={s.field}>
              واتساب (اختياري)
              <input
                type="tel"
                dir="ltr"
                name="whatsapp"
                defaultValue={profile?.whatsapp}
              />
            </label>
          </div>
          <label className={s.field}>
            نبذة عن الأسرة
            <textarea
              name="description"
              defaultValue={profile?.description}
              maxLength={2000}
            />
          </label>
          <fieldset>
            <legend>تصنيفات المنتجات · اختر واحدًا أو أكثر</legend>
            <div className={s.checks}>
              {categories.map((c) => (
                <label key={c.id}>
                  <input
                    name="categoryIds"
                    value={c.id}
                    type="checkbox"
                    defaultChecked={profile?.categoryIds?.includes(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>طرق الحصول على المنتجات</legend>
            <div className={s.checks}>
              <label>
                <input
                  name="delivery"
                  type="checkbox"
                  defaultChecked={profile?.delivery}
                />
                التوصيل متاح
              </label>
              <label>
                <input
                  name="pickup"
                  type="checkbox"
                  defaultChecked={profile?.pickup}
                />
                الاستلام متاح
              </label>
            </div>
            <p className={s.muted}>
              لا يظهر عنوان السكن الدقيق للزوار. يتم تنسيق تفاصيل الاستلام
              مباشرة مع الأسرة.
            </p>
          </fieldset>
          <AdvancedFields profile={profile} cities={cities} />
          {!documentId && documentType !== "exception" && (
            <p className={s.notice}>
              أرفق مستند الأهلية قبل إرسال طلب التسجيل.
            </p>
          )}
          <div className={s.actions}>
            <button
              className={s.button}
              disabled={busy || (!documentId && documentType !== "exception")}
            >
              {busy ? "جارٍ الحفظ…" : "حفظ وإرسال للمراجعة"}
            </button>
            <button
              type="button"
              className={s.button}
              onClick={() => {
                setStep(1);
                setSuccess("");
              }}
            >
              تحديث مستند الأهلية
            </button>
          </div>
        </form>
      )}
    </>
  );
}
export function Dashboard() {
  const session = useSession();
  return (
    <AccountShell>
      <Guard {...session} />
      {session.ready && session.user && (
        <>
          <div className={s.actions}>
            <p>مرحبًا، {session.user.name}</p>
            <button
              className={s.button}
              onClick={async () => {
                try {
                  await api("/api/logout", { method: "POST" });
                  window.location.assign("/");
                } catch {
                  window.alert("تعذر تسجيل الخروج. حاول مجددًا.");
                }
              }}
            >
              تسجيل الخروج
            </button>
            {session.user.role === "admin" && <a href="/admin">لوحة الإدارة</a>}
          </div>
          <ProfileForm />
        </>
      )}
    </AccountShell>
  );
}
