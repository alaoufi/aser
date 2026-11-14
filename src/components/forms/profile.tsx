"use client";
import { categoryLabel } from "@/lib/category-label";
import { LocationFields } from "@/components/public/location-fields";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Category, City, SessionUser } from "@/lib/types";
import {
  AdvancedFields,
  advancedPayload,
  type AdvancedProfile,
} from "./profile-advanced";
import { CookingAvailability } from "./cooking-availability";
import { FulfillmentCard } from "./fulfillment";
import { ContactVisibilityCard } from "./contact-visibility";
import { SectionIcon } from "./section-icon";
import { DeleteAccountSection } from "./delete-account";
import { CertificateCard } from "./certificate-card";
import { stopPushOnLogout } from "@/components/public/push-setup";
import {
  AccountShell,
  Guard,
  LoginForm,
  Message,
  api,
  s,
  useSession,
} from "./shared";
import { FAMILY_STATUS_CHANGED, FamilyStatusBanner } from "./family-status";
import { DeliveryScopeFields, readDeliveryScope } from "./delivery-scope";
type Profile = AdvancedProfile & {
  id?: string;
  deliveryScope?: "coverage" | "kingdom";
  shippingFee?: number | null;
  name: string;
  tradeName?: string | null;
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
  nationalId?: string | null;
  workLocation?: string | null;
};
// المرفق اختياري: التسجيل يُقبل دونه، والإدارة تفعّل الحساب وتطلب النواقص في ملاحظتها.
const documentTypes = [
  ["producer_certificate", "شهادة أسرة منتجة"],
  ["national_id", "صورة الهوية الوطنية"],
  ["freelance", "وثيقة عمل حر"],
  ["commercial_registration", "سجل تجاري"],
  ["other_document", "شهادة أو مستند آخر"],
];
const pickType = (type?: string) =>
  documentTypes.some(([id]) => id === type) ? type! : "producer_certificate";
export function ProfileForm({
  registration = false,
}: {
  registration?: boolean;
}) {
  const session = useSession();
  const [verified, setVerified] = useState<SessionUser | null>(null);
  const user = verified || session.user;
  const [profile, setProfile] = useState<Profile | null>(null),
    [categories, setCategories] = useState<Category[]>([]),
    [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false),
    [extrasOpen, setExtrasOpen] = useState(false),
    [documentId, setDocumentId] = useState(""),
    [documentType, setDocumentType] = useState("producer_certificate");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const uploaded = useRef<{ file: File; type: string; id: string } | null>(
    null,
  );
  async function load() {
    const d = await api<{
      profile: Profile | null;
      categories: Category[];
      cities: City[];
    }>("/api/producer/profile");
    setProfile(d.profile);
    setCategories(d.categories);
    setCities(d.cities);
    setDocumentId(d.profile?.documentId || "");
    setDocumentType(pickType(d.profile?.documentType));
  }
  useEffect(() => {
    if (!user) return;
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [user?.id]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSuccess("");
    const form = e.currentTarget;
    const f = new FormData(form);
    let optional: Record<string, unknown> = {};
    const categoryIds = f.getAll("categoryIds").map(String);
    if (!profile && !categoryIds.length) {
      setError("اختر قسمًا واحدًا على الأقل لمنتجاتك.");
      return;
    }
    try {
      if (extrasOpen) {
        optional = {
          ...advancedPayload(f),
          description: f.get("description"),
          neighborhood: f.get("neighborhood"),
          whatsapp: f.get("whatsapp"),
          documentNumber: f.get("documentNumber") || null,
          documentExpiresAt: f.get("documentExpiresAt") || null,
        };
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      let savedDocument = documentId;
      const file = f.get("file");
      if (file instanceof File && file.size) {
        if (
          file.size > 10 * 1024 * 1024 ||
          !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
        )
          throw Error("المرفق PDF أو JPEG أو PNG وبحد أقصى 10 ميجابايت.");
        if (
          uploaded.current?.file === file &&
          uploaded.current.type === documentType
        )
          savedDocument = uploaded.current.id;
        else {
          const uploadForm = new FormData();
          uploadForm.set("file", file);
          uploadForm.set("type", documentType);
          const d = await api<{ id: string }>("/api/documents", {
            method: "POST",
            body: uploadForm,
          });
          savedDocument = d.id;
          uploaded.current = { file, type: documentType, id: d.id };
          setDocumentId(d.id);
          const input =
            form.querySelector<HTMLInputElement>('input[name="file"]');
          if (input) input.value = "";
        }
      }
      await api("/api/producer/profile", {
        method: "POST",
        body: JSON.stringify({
          ...optional,
          ...(!profile ? { categoryIds } : {}),
          ...readDeliveryScope(f),
          name: f.get("name"),
          tradeName: String(f.get("tradeName") ?? "").trim(),
          phone: user.phone,
          cityId: f.get("cityId"),
          nationalId: f.get("nationalId"),
          workLocation: f.get("workLocation"),
          documentType,
          documentId: savedDocument || null,
        }),
      });
      await load();
      setSuccess(
        registration || !profile
          ? "تم تسجيل أسرتك بنجاح ✓ طلبك الآن تحت المراجعة، وستظهر حالة الحساب أعلى الصفحة. يمكنك إضافة منتجاتك خلال المراجعة."
          : "تم حفظ البيانات وإرسالها للمراجعة.",
      );
      await load().catch(() => {});
      window.dispatchEvent(new Event(FAMILY_STATUS_CHANGED));
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
      <FamilyStatusBanner />
      {profile && <CookingAvailability />}
      {profile && <FulfillmentCard />}
      {profile && <ContactVisibilityCard />}
      {profile && (
        <Link className={s.button} href="/dashboard/coverage">
          تحديد نطاق التغطية: المدن والمراكز والأحياء
        </Link>
      )}
      {profile && (
        <FamilyCategories
          categories={categories}
          selected={profile.categoryIds}
          onSaved={(ids) => setProfile({ ...profile, categoryIds: ids })}
        />
      )}
      <h1>
        {registration ? "تسجيل أسرة في أكلات جدتنا" : "بيانات الأسرة المنتجة"}
      </h1>
      <p className={s.muted}>
        البيانات الأساسية فقط؛ يمكنك إضافة التفاصيل الأخرى لاحقًا.
      </p>
      <Message error={error} success={success} />
      {!loaded ? (
        <p role="status">جارٍ تحميل البيانات…</p>
      ) : (
        <form
          key={profile?.id || "new"}
          className={`${s.form} ${s.card}`}
          onSubmit={save}
        >
          <div className={s.grid}>
            <label className={s.field}>
              الاسم المعلن (الاسم التجاري)
              <input
                name="tradeName"
                required
                minLength={2}
                maxLength={120}
                defaultValue={profile?.tradeName || ""}
                aria-describedby="trade-name-hint"
              />
              <small id="trade-name-hint">
                يظهر في الموقع وللعملاء، ولا يتكرر لأسرتين.
              </small>
            </label>
            <label className={s.field}>
              الاسم
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={profile?.name || user.name}
                aria-describedby="name-hint"
              />
              <small id="name-hint">للإدارة فقط، ولا يظهر للعملاء.</small>
            </label>
            <label className={s.field}>
              رقم الهوية
              <input
                name="nationalId"
                inputMode="numeric"
                dir="ltr"
                required
                minLength={10}
                maxLength={10}
                pattern="[0-9٠-٩۰-۹]{10}"
                defaultValue={profile?.nationalId || ""}
                autoComplete="off"
              />
            </label>
            <label className={s.field}>
              رقم الجوال
              <input
                name="phone"
                type="tel"
                dir="ltr"
                value={user.phone}
                readOnly
                aria-describedby="verified-phone"
              />
              <small id="verified-phone">تم التحقق من هذا الجوال.</small>
            </label>
          </div>
          <fieldset>
            <legend>المرفقات (اختيارية)</legend>
            <p className={s.muted}>
              أرفق شهادة الأسرة المنتجة أو صورة الهوية الوطنية إن وُجدت، فذلك
              يسرّع الاعتماد. يُقبل التسجيل دون مرفق، وتراسلك الإدارة بالنواقص.
            </p>
            <div className={s.grid}>
              <label className={s.field}>
                نوع المرفق
                <select
                  value={documentType}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setDocumentId("");
                    uploaded.current = null;
                  }}
                >
                  {documentTypes.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                الملف
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={busy}
                />
                <small>صورة أو PDF، حتى 10 ميجابايت. تراه الإدارة فقط.</small>
              </label>
            </div>
          </fieldset>
          {documentId && (
            <a
              href={`/api/documents/${encodeURIComponent(documentId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              عرض المرفق المحفوظ
            </a>
          )}
          <fieldset>
            <legend>موقع العمل</legend>
            <div className={s.grid}>
              <LocationFields
                cities={cities}
                defaultCity={profile?.cityId}
                cityName="cityId"
                regionName="regionId"
                required
                className={s.field}
              />
            </div>
            <label className={s.field}>
              عنوان أو رابط موقع العمل
              <textarea
                name="workLocation"
                required
                minLength={5}
                maxLength={1000}
                defaultValue={profile?.workLocation || ""}
              />
            </label>
            <p className={s.muted}>
              رقم الهوية والموقع الدقيق خاصان بالأسرة المنتجة والإدارة. يظهر
              للزوار اسم المدينة فقط.
            </p>
          </fieldset>
          {!profile && (
            <fieldset>
              <legend>أقسام منتجاتك (اختر قسمًا واحدًا على الأقل)</legend>
              <div className={s.checks}>
                {categories.map((c) => (
                  <label key={c.id}>
                    <input name="categoryIds" type="checkbox" value={c.id} />
                    {categoryLabel(c, categories)}
                  </label>
                ))}
              </div>
              <small>
                يمكنك تعديلها لاحقًا من لوحة الأسرة دون إعادة مراجعة.
              </small>
            </fieldset>
          )}
          <DeliveryScopeFields
            defaultScope={profile?.deliveryScope ?? "coverage"}
            defaultFee={profile?.shippingFee ?? null}
          />
          <details
            open={extrasOpen}
            onToggle={(e) => setExtrasOpen(e.currentTarget.open)}
          >
            <summary>تفاصيل إضافية (اختيارية)</summary>
            {extrasOpen && (
              <div className={s.form} style={{ marginTop: 16 }}>
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
                    واتساب (اختياري)
                    <input
                      name="whatsapp"
                      type="tel"
                      dir="ltr"
                      defaultValue={profile?.whatsapp}
                    />
                  </label>
                  <label className={s.field}>
                    الحي (اختياري)
                    <input
                      name="neighborhood"
                      maxLength={120}
                      defaultValue={profile?.neighborhood}
                    />
                  </label>
                </div>
                <label className={s.field}>
                  نبذة عن الأسرة المنتجة
                  <textarea
                    name="description"
                    maxLength={2000}
                    defaultValue={profile?.description}
                  />
                </label>
                <AdvancedFields profile={profile} cities={cities} />
              </div>
            )}
          </details>
          <button className={s.button} disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ وإرسال للمراجعة"}
          </button>
        </form>
      )}
    </>
  );
}
/** أقسام منتجات الأسرة: تُعدَّل في أي وقت دون إعادة الملف للمراجعة. */
function FamilyCategories({
  categories,
  selected,
  onSaved,
}: {
  categories: Category[];
  selected: string[];
  onSaved: (ids: string[]) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (success || error)
      feedback.current?.scrollIntoView({ block: "nearest" });
  }, [success, error]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ids = new FormData(e.currentTarget).getAll("categoryIds").map(String);
    setError("");
    setSuccess("");
    if (!ids.length) {
      setError("اختر قسمًا واحدًا على الأقل.");
      return;
    }
    setBusy(true);
    const put = (removeProducts?: boolean) =>
      api<{ categoryIds: string[] }>("/api/producer/categories", {
        method: "PUT",
        body: JSON.stringify({
          categoryIds: ids,
          ...(removeProducts ? { removeProducts } : {}),
        }),
      });
    try {
      let d: { categoryIds: string[] };
      try {
        d = await put();
      } catch (err) {
        // إزالة قسم عليه منتجات: تأكيد صريح، ثم تُحذف منتجاته (أغلبها وقتية لأيام).
        const e = err as Error & { data?: { confirm?: boolean } };
        if (!e.data?.confirm) throw err;
        if (!window.confirm(e.message)) {
          setError("لم تُحفظ الأقسام؛ منتجاتك كما هي.");
          return;
        }
        d = await put(true);
      }
      onSaved(d.categoryIds);
      setSuccess("تم حفظ أقسام منتجاتك.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="أقسام منتجاتي" id="family-categories">
      <form className={`${s.form} ${s.card}`} onSubmit={save}>
        <h2>أقسام منتجاتي</h2>
        <p className={s.muted}>
          تختار منها عند إضافة منتج. لا يظهر القسم للزوار إلا إذا كان عليه منتج
          منشور.
        </p>
        <div className={s.checks}>
          {categories.map((c) => (
            <label key={c.id}>
              <input
                name="categoryIds"
                type="checkbox"
                value={c.id}
                defaultChecked={selected.includes(c.id)}
                onChange={() => setSuccess("")}
              />
              {categoryLabel(c, categories)}
            </label>
          ))}
        </div>
        <button className={s.button} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ أقسامي"}
        </button>
        {/* الرسالة بجانب زر الحفظ حتى تُرى بعد الضغط مباشرة. */}
        <div ref={feedback}>
          <Message error={error} success={success} />
        </div>
      </form>
    </section>
  );
}
/** أقسام لوحة الأسرة المنتجة: مربعات صغيرة بدل أسطر الروابط. */
const familySections: [href: string, label: string, icon: string][] = [
  ["/dashboard/products", "المنتجات", "products"],
  ["/dashboard/orders", "الطلبات", "orders"],
  ["/dashboard/offers", "العروض", "offers"],
  ["/dashboard/library", "مكتبة الصور", "library"],
  ["/dashboard/coverage", "التغطية", "coverage"],
];
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
                  await stopPushOnLogout();
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
          {session.user.role === "producer" && (
            <nav
              className={`${s.adminNav} ${s.familyNav}`}
              aria-label="أقسام الأسرة المنتجة"
            >
              <div className={s.adminNavGroup}>
                {familySections.map(([href, label, icon]) => (
                  <Link key={href} className={s.adminNavItem} href={href}>
                    <SectionIcon name={icon} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </nav>
          )}
          {session.user.role === "producer" && <CertificateCard />}
          <ProfileForm />
          <DeleteAccountSection />
        </>
      )}
    </AccountShell>
  );
}
