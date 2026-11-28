"use client";
import { useTx } from "@/components/site-texts";
import { AdminInsights } from "./admin-insights";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminSummary,
  AppLinksAdmin,
  DomainVerificationAdmin,
  StoreReviewAdmin,
  SuggestionsAdmin,
  ProductFieldsAdmin,
  CategoriesAdmin,
  LocationsAdmin,
  OrdersAdmin,
  ProductsAdmin,
  ReportsAdmin,
  TemplateAdmin,
  TextsAdmin,
} from "./admin-tools";
import { familyAccountState, type FamilyState } from "@/lib/family-status";
import { Guard, Message, api, s, useSession } from "./shared";
import { canAny, isManager } from "@/lib/permissions";
import { NAV_GROUPS, allowedItem } from "@/lib/admin-nav";
import { MembersAdmin } from "./members";
import { AdminDocuments } from "./admin-documents";
import { APPROVALS_CHANGED } from "@/components/admin/admin-frame";
import { AdminCouriers } from "./courier";
import { ContractsAdmin } from "./subscriptions";
import { SecurityLog } from "./security-log";
import { BackupsAdmin } from "./backups-admin";
import { DeletedChatsAdmin } from "./deleted-chats";
import { ViewsAdmin } from "./views-admin";

/** أقسام اللوحة بحسب القائمة الجانبية (src/lib/admin-nav.ts): /admin/<القسم>. */
const SECTIONS = NAV_GROUPS.flatMap((g) => g.items).filter((it) =>
  /^\/admin\/[a-z-]+$/.test(it.to),
);
type Application = {
  id: string;
  name: string;
  tradeName?: string | null;
  status: string;
  verified?: boolean;
  ownerName?: string;
  phone?: string;
  cityName?: string;
  description?: string;
  documentType?: string;
  documentNumber?: string;
  documentExpiresAt?: string;
  documents?: {
    id: string;
    type?: string;
    fileName?: string;
    createdAt?: string;
  }[];
  documentId?: string;
  reviewReason?: string;
  /** تعهدت بتقديم المستندات حتى هذا التاريخ (قرار المالك 2026-11-26). */
  docsDueAt?: string | null;
  /** منتجاتها مخفية حتى ترفع المستندات. */
  docsHiddenAt?: string | null;
  /** complete: مكتمل الشروط؛ exempt: مستثنى من الشروط. */
  docsStatus?: string | null;
  nationalId?: string | null;
  workLocation?: string | null;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
/** معتمدة لكن الإدارة كتبت لها نواقص عند الاعتماد (لا تُطالَب بها الأسرة؛ للمتابعة هنا). */
function hasMissing(p: Application) {
  return p.status === "approved" && Boolean(p.reviewReason?.trim());
}
/** تعهدت بالمستندات خلال 15 يومًا ومضت المدة ولم ترفعها: للمتابعة (الأسرة تبقى ظاهرة). */
function docsLate(p: Application) {
  return Boolean(
    p.docsDueAt && !p.documentId && Date.parse(p.docsDueAt) < Date.now(),
  );
}
function stateOf(p: Application): FamilyState {
  return familyAccountState(
    {
      status: p.status,
      verified: Boolean(p.verified),
      documentId: p.documentId,
      documentType: p.documentType,
      documentExpiresAt: p.documentExpiresAt,
      reviewReason: p.reviewReason,
      docsStatus: p.docsStatus,
    },
    today(),
  );
}
const documentLabels: Record<string, string> = {
  producer_certificate: "شهادة أسرة منتجة",
  national_id: "صورة الهوية الوطنية",
  freelance: "وثيقة عمل حر",
  commercial_registration: "سجل تجاري",
  other_document: "شهادة أو مستند آخر",
  exception: "طلب استثناء إداري",
};
/**
 * مهلة المستندات (قرار المالك 2026-11-26): تمديدها، أو إخفاء منتجات الأسرة حتى ترفعها (تعود كما كانت
 * عند الرفع)، أو إظهارها. الأسرة تُنبَّه بكل قرار.
 */
function DocsControls({
  producer,
  onSaved,
}: {
  producer: Application;
  onSaved: () => Promise<void>;
}) {
  const { tx, txb } = useTx();
  const [days, setDays] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/producers/${producer.id}/docs`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className={s.docsControls} disabled={busy}>
      <legend>{txb("docs.admin.title")}</legend>
      {producer.docsHiddenAt && (
        <p className={s.notice}>{tx("docs.admin.hiddenNow")}</p>
      )}
      <Message error={error} />
      <div className={s.actions}>
        <label className={s.inlineField}>
          <span className="sr-only">{tx("docs.admin.days")}</span>
          <select
            aria-label={tx("docs.admin.days")}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 15, 30].map((d) => (
              <option key={d} value={d}>
                {tx("docs.admin.daysOption", { n: d })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={s.button}
          onClick={() => act({ action: "extend", days })}
        >
          {txb("docs.admin.extend")}
        </button>
        {producer.docsHiddenAt ? (
          <button
            type="button"
            className={s.buttonSecondary}
            onClick={() => act({ action: "show" })}
          >
            {txb("docs.admin.show")}
          </button>
        ) : (
          <button
            type="button"
            className={s.danger}
            onClick={() => act({ action: "hide" })}
          >
            {txb("docs.admin.hide")}
          </button>
        )}
      </div>
    </fieldset>
  );
}

function Review({
  producer,
  onSaved,
}: {
  producer: Application;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState("");
  const activating = ["approved", "complete", "exempt"].includes(decision);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/admin/producers/${encodeURIComponent(producer.id)}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: f.get("decision"),
            reason: f.get("reason"),
            eligibilityConfirmed: f.has("eligibilityConfirmed"),
          }),
        },
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={s.card}>
      <span className={s.tag}>{stateOf(producer).label}</span>
      {producer.docsStatus === "exempt" && (
        <span className={s.tag}> مستثنى من الشروط</span>
      )}
      <h2>{producer.tradeName || producer.name}</h2>
      {(producer.ownerName || producer.phone) && (
        <p>
          صاحب الحساب: {producer.ownerName}{" "}
          {producer.phone && <bdi dir="ltr">{producer.phone}</bdi>}
        </p>
      )}
      <p>
        الاسم التجاري المعلن: {producer.tradeName || "لم يُحدد بعد"} · الاسم
        الحقيقي (للإدارة): {producer.name}
      </p>
      <p>{producer.cityName}</p>
      <p>{producer.description}</p>
      {producer.nationalId && (
        <p>
          رقم الهوية (خاص): <bdi>{producer.nationalId}</bdi>
        </p>
      )}
      {producer.workLocation && (
        <p style={{ overflowWrap: "anywhere" }}>
          موقع العمل (خاص): {producer.workLocation}
        </p>
      )}
      {producer.documentId ? (
        <p>
          نوع المرفق:{" "}
          {documentLabels[producer.documentType ?? ""] ?? producer.documentType}
        </p>
      ) : (
        <p className={s.tag}>لم ترفق مستندات بعد</p>
      )}
      {producer.docsDueAt && !producer.documentId && (
        <p className={docsLate(producer) ? s.notice : s.muted}>
          {docsLate(producer)
            ? "تأخرت في المستندات: "
            : "تعهدت بتقديم المستندات الرسمية حتى "}
          {new Date(producer.docsDueAt).toLocaleDateString("ar-SA-u-nu-latn", {
            timeZone: "Asia/Riyadh",
          })}
        </p>
      )}
      {producer.docsDueAt && !producer.documentId && (
        <DocsControls producer={producer} onSaved={onSaved} />
      )}
      {producer.documentType === "exception" && (
        <p>تفاصيل طلب الاستثناء: {producer.reviewReason || "دون تفاصيل"}</p>
      )}
      {hasMissing(producer) && producer.documentType !== "exception" && (
        <p className={s.notice}>
          النواقص المكتوبة عند الاعتماد: {producer.reviewReason}
        </p>
      )}
      <p>
        رقم المستند: {producer.documentNumber || "غير مسجل"} · تاريخ الانتهاء:{" "}
        {producer.documentExpiresAt?.slice(0, 10) || "غير مسجل"}
      </p>
      <div className={s.actions}>
        {(
          producer.documents ||
          (producer.documentId ? [{ id: producer.documentId }] : [])
        ).map((d) => (
          <a
            key={d.id}
            href={`/api/documents/${encodeURIComponent(d.id)}`}
            target="_blank"
            // بلا noreferrer: الخادم يعرف من الصفحة أن الطلب من اللوحة فيستعمل جلستها.
            rel="noopener"
          >
            عرض المستند الخاص {("fileName" in d && d.fileName) || ""}
          </a>
        ))}
      </div>
      <Message error={error} />
      <form className={s.form} onSubmit={submit}>
        <label className={s.field}>
          <span className="sr-only">القرار</span>
          <select
            name="decision"
            required
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="" disabled>
              اختر القرار
            </option>
            <option value="approved">
              تفعيل الحساب (ولو دون مستندات، مع ذكر النواقص في الملاحظة)
            </option>
            {/* قرار المالك 2026-11-27 */}
            <option value="complete">تم استكمال المطلوب (مكتمل الشروط)</option>
            <option value="exempt">
              يُستثنى من الشروط (يظهر مع النواقص، ولا يُوقف حسابه بمهلة)
            </option>
            <option value="rejected">
              طلب استكمال النواقص قبل التفعيل (الحساب لا يظهر للعملاء)
            </option>
            <option value="suspended">إيقاف الحساب</option>
          </select>
        </label>
        <label className={s.field}>
          {activating
            ? "ملاحظة للأسرة المنتجة (اختيارية عند التفعيل؛ تظهر لها أعلى صفحتها)"
            : "ملاحظة للأسرة المنتجة (مطلوبة: اذكر النواقص أو سبب القرار؛ تظهر لها أعلى صفحتها)"}
          <textarea
            name="reason"
            required={!activating}
            minLength={activating ? undefined : 5}
            maxLength={2000}
            placeholder={
              producer.documentId
                ? "مثال: تم التفعيل، أهلًا بكم."
                : "مثال: تم التفعيل. نرجو إرفاق شهادة الأسرة المنتجة أو صورة الهوية الوطنية من صفحة بيانات الأسرة."
            }
          />
        </label>
        <label className={s.checks}>
          <input
            name="eligibilityConfirmed"
            type="checkbox"
            required={activating}
          />
          راجعت بيانات الأسرة المنتجة وأوافق على تفعيل حسابها.
        </label>
        <button disabled={busy} className={s.button}>
          {busy ? "جارٍ حفظ القرار…" : "حفظ قرار المراجعة"}
        </button>
      </form>
    </article>
  );
}
/**
 * لوحة الإدارة: بلا قسم (/admin) لوحة التحكم وملخصها، ومع قسم (/admin/orders…) ذلك القسم.
 * التنقل بين الأقسام من القائمة الجانبية (AdminFrame)، والصلاحية يفرضها الخادم في كل طلب.
 */
export function Admin({ section }: { section?: string } = {}) {
  const session = useSession();
  const router = useRouter();
  const [producers, setProducers] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const item = section
    ? SECTIONS.find((it) => it.to === `/admin/${section}`)
    : undefined;
  const active = item && allowedItem(session.user, item) ? section : undefined;
  const open = (tab: string) => router.push(`/admin/${tab}`);
  async function load() {
    const d = await api<{ producers: Application[] }>("/api/admin/producers");
    setProducers(d.producers);
  }
  // الروابط القديمة (إشعار «أسرة تنتظر الاعتماد»: /admin?tab=approvals) تفتح القسم بمساره الجديد.
  useEffect(() => {
    if (section) return;
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && SECTIONS.some((it) => it.to === `/admin/${wanted}`))
      router.replace(`/admin/${wanted}`);
  }, [section, router]);
  const waiting = producers.filter((p) => p.status === "pending");
  useEffect(() => {
    if (canAny(session.user, "approvals", "producers"))
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user]);
  return (
    // داخل إطار اللوحة (AdminFrame): القائمة الجانبية تتنقل بين الأقسام.
    <>
      <Guard {...session} admin />
      {isManager(session.user) && !section && (
        <>
          {/* العنوان ظاهر في رأس اللوحة؛ هنا لقارئ الشاشة فقط. */}
          <h1 className="sr-only">لوحة التحكم</h1>
          <AdminSummary onOpen={open} />
          <AdminInsights />
          {waiting.length > 0 && (
            <p className={s.notice}>
              {waiting.length} أسرة تنتظر الاعتماد.{" "}
              <button
                type="button"
                className={s.buttonSecondary}
                onClick={() => open("approvals")}
              >
                افتح الاعتماد
              </button>
            </p>
          )}
        </>
      )}
      {isManager(session.user) && section && (
        <>
          {active === "members" ? (
            <MembersAdmin />
          ) : active === "orders" ? (
            <OrdersAdmin />
          ) : active === "products" ? (
            <ProductsAdmin />
          ) : active === "categories" ? (
            <CategoriesAdmin />
          ) : active === "product-fields" ? (
            <ProductFieldsAdmin />
          ) : active === "locations" ? (
            <LocationsAdmin />
          ) : active === "reports" ? (
            <ReportsAdmin />
          ) : active === "contracts" ? (
            <ContractsAdmin />
          ) : active === "security" ? (
            <SecurityLog />
          ) : active === "backups" ? (
            <BackupsAdmin />
          ) : active === "deleted-chats" ? (
            <DeletedChatsAdmin />
          ) : active === "views" ? (
            <ViewsAdmin />
          ) : active === "template" ? (
            <TemplateAdmin />
          ) : active === "texts" ? (
            <TextsAdmin />
          ) : active === "app" ? (
            <AppLinksAdmin />
          ) : active === "verification" ? (
            <DomainVerificationAdmin />
          ) : active === "review" ? (
            <StoreReviewAdmin />
          ) : active === "suggestions" ? (
            <SuggestionsAdmin />
          ) : active === "approvals" ? (
            <section aria-label="اعتماد الأسر المنتجة">
              <h2>اعتماد الأسر المنتجة</h2>
              <p className={s.muted}>
                كل أسرة سجّلت أو عدّلت بياناتها وتنتظر قرارك. فعّلها ولو دون
                مستندات واكتب النواقص في الملاحظة، أو اطلب الاستكمال قبل
                التفعيل. يصلك تنبيه عند كل تسجيل جديد.
              </p>
              <Message error={error} success={success} />
              {!loaded ? (
                <p role="status">جارٍ تحميل الطلبات…</p>
              ) : waiting.length ? (
                waiting.map((p) => (
                  <Review
                    key={p.id}
                    producer={p}
                    onSaved={async () => {
                      await load();
                      window.dispatchEvent(new Event(APPROVALS_CHANGED));
                      setSuccess("تم حفظ قرار المراجعة.");
                    }}
                  />
                ))
              ) : (
                <p className={s.notice}>لا توجد أسر تنتظر الاعتماد الآن.</p>
              )}
              <AdminCouriers
                onChanged={() =>
                  window.dispatchEvent(new Event(APPROVALS_CHANGED))
                }
              />
            </section>
          ) : active !== "producers" ? (
            <p className={s.notice}>
              {item
                ? "هذا القسم ليس ضمن صلاحيات حسابك؛ تواصل مع مدير المنصة."
                : "هذا القسم غير موجود. اختر قسمًا من القائمة."}
            </p>
          ) : (
            <>
              <p className={s.notice}>
                الهوية الوطنية ليست ترخيصًا. الاستثناء الإداري لا يعفي من
                التراخيص الإلزامية. قرار التوثيق إداري ولا يمثل اعتمادًا
                حكوميًا. المستندات خاصة ومخصصة للمراجعة فقط.
              </p>
              <Message error={error} success={success} />
              <div className={s.actions} role="group" aria-label="تصفية الأسر">
                {(
                  [
                    ["review", "تحت المراجعة"],
                    ["incomplete", "بانتظار إكمال المطلوب"],
                    ["active", "نشط"],
                    ["trusted", "موثوق"],
                    ["suspended", "موقوف"],
                    ["missing", "من لديهم نواقص"],
                    ["late", "تأخرت في المستندات"],
                    ["exempt", "مستثنى من الشروط"],
                    ["all", "الكل"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className={s.buttonSecondary}
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                  >
                    {label} (
                    {id === "all"
                      ? producers.length
                      : producers.filter((p) =>
                          id === "missing"
                            ? hasMissing(p)
                            : id === "late"
                              ? docsLate(p)
                              : id === "exempt"
                                ? p.docsStatus === "exempt"
                                : stateOf(p).key === id,
                        ).length}
                    )
                  </button>
                ))}
                {/* تبويب «عرض المستندات» (قرار المالك 2026-11-27): كل مستندات كل أسرة. */}
                <button
                  type="button"
                  className={s.buttonSecondary}
                  aria-pressed={filter === "documents"}
                  onClick={() => setFilter("documents")}
                >
                  عرض المستندات
                </button>
              </div>
              {filter === "documents" ? (
                <AdminDocuments labels={documentLabels} />
              ) : (
                <>
                  <label className={s.field}>
                    بحث باسم الأسرة المنتجة أو صاحبها أو الجوال أو المدينة
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  {!loaded ? (
                    <p role="status">جارٍ تحميل طلبات المراجعة…</p>
                  ) : (
                    (() => {
                      const q = query.trim().toLowerCase();
                      const shown = producers.filter(
                        (p) =>
                          (filter === "all" ||
                            (filter === "missing"
                              ? hasMissing(p)
                              : filter === "late"
                                ? docsLate(p)
                                : filter === "exempt"
                                  ? p.docsStatus === "exempt"
                                  : stateOf(p).key === filter)) &&
                          (!q ||
                            [
                              p.name,
                              p.tradeName,
                              p.ownerName,
                              p.phone,
                              p.cityName,
                            ]
                              .filter(Boolean)
                              .some((v) =>
                                String(v).toLowerCase().includes(q),
                              )),
                      );
                      return shown.length ? (
                        shown.map((p) => (
                          <Review
                            key={p.id}
                            producer={p}
                            onSaved={async () => {
                              await load();
                              window.dispatchEvent(
                                new Event(APPROVALS_CHANGED),
                              );
                              setSuccess("تم حفظ قرار المراجعة.");
                            }}
                          />
                        ))
                      ) : (
                        <p className={s.notice}>لا توجد أسر في هذا التصنيف.</p>
                      );
                    })()
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
