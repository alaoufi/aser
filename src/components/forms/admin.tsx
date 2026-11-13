"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { COVERAGE_URL } from "./admin-cache";
import {
  AdminSummary,
  AppLinksAdmin,
  StoreReviewAdmin,
  ProductFieldsAdmin,
  CategoriesAdmin,
  LocationsAdmin,
  OrdersAdmin,
  ProductsAdmin,
  ReportsAdmin,
  TemplateAdmin,
  TextsAdmin,
  prefetchAdmin,
} from "./admin-tools";
import { familyAccountState, type FamilyState } from "@/lib/family-status";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import { can, isManager, type AdminPermission } from "@/lib/permissions";
import { MembersAdmin } from "./members";
import { SectionIcon as AdminIcon } from "./section-icon";

/** بيانات كل قسم، تُحمَّل مسبقًا عند المرور على زره أو التركيز عليه. */
const tabData: Record<string, string[]> = {
  orders: ["/api/admin/orders"],
  products: ["/api/admin/products", "/api/admin/categories"],
  categories: ["/api/admin/categories", "/api/admin/product-fields"],
  locations: ["/api/admin/locations"],
  reports: ["/api/admin/reports"],
  template: ["/api/admin/settings"],
  texts: ["/api/admin/texts"],
  app: ["/api/admin/app-links"],
  review: ["/api/admin/store-review"],
  members: ["/api/admin/members?q="],
};
/** أقسام الإدارة وصلاحية كل قسم؛ «الأعضاء» للمدير الكامل فقط. */
const adminTabs: [
  id: string,
  label: string,
  permission: AdminPermission | "owner",
][] = [
  ["producers", "مراجعة الأسر", "producers"],
  ["orders", "الطلبات", "orders"],
  ["products", "المنتجات", "products"],
  ["categories", "إدارة الأقسام", "categories"],
  ["locations", "المواقع", "locations"],
  ["reports", "البلاغات", "reports"],
  ["template", "قالب الموقع", "content"],
  ["texts", "نصوص الموقع", "content"],
  ["app", "تطبيق الجوال", "content"],
  ["review", "مراجعة المتاجر", "owner"],
  ["members", "الأعضاء والصلاحيات", "owner"],
];
/** تجميع الأقسام في شاشة الإدارة (الأسماء للقارئ الآلي فقط). */
const adminGroups: [group: string, ids: string[]][] = [
  ["الأسر والطلبات", ["producers", "orders", "products", "reports"]],
  ["الأقسام والمواقع", ["categories", "locations"]],
  ["الموقع والأعضاء", ["template", "texts", "app", "review", "members"]],
];
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
  nationalId?: string | null;
  workLocation?: string | null;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
function stateOf(p: Application): FamilyState {
  return familyAccountState(
    {
      status: p.status,
      verified: Boolean(p.verified),
      documentId: p.documentId,
      documentType: p.documentType,
      documentExpiresAt: p.documentExpiresAt,
      reviewReason: p.reviewReason,
    },
    today(),
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
            exceptionApproved: f.has("exceptionApproved"),
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
      <h2>{producer.name}</h2>
      {(producer.ownerName || producer.phone) && (
        <p>
          صاحب الحساب: {producer.ownerName}{" "}
          {producer.phone && <bdi dir="ltr">{producer.phone}</bdi>}
        </p>
      )}
      {producer.tradeName && <p>الاسم التجاري: {producer.tradeName}</p>}
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
      <p>نوع الإثبات: {producer.documentType || "راجع المستند المرفق"}</p>
      {producer.documentType === "exception" && (
        <p>تفاصيل طلب الاستثناء: {producer.reviewReason || "دون تفاصيل"}</p>
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
            rel="noopener noreferrer"
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
            <option value="approved">اعتماد</option>
            <option value="rejected">
              طلب استكمال (يعود للأسرة المنتجة لتعديل المطلوب)
            </option>
            <option value="suspended">إيقاف الحساب</option>
          </select>
        </label>
        <label className={s.field}>
          سبب القرار (يُحفظ في سجل المراجعة ويظهر للأسرة المنتجة عند طلب
          الاستكمال)
          <textarea name="reason" required minLength={5} maxLength={2000} />
        </label>
        <label className={s.checks}>
          <input
            name="eligibilityConfirmed"
            type="checkbox"
            required={decision === "approved"}
          />
          تحققت من أهلية النشاط واستيفاء التراخيص الإلزامية قبل الاعتماد.
        </label>
        {producer.documentType === "exception" && !producer.documentId && (
          <label className={s.checks}>
            <input
              type="checkbox"
              name="exceptionApproved"
              required={decision === "approved"}
            />
            أمنح استثناءً إداريًا بعد مراجعة الأهلية، والسبب الموثق أعلاه لا يقل
            عن عشرة أحرف.
          </label>
        )}
        <button disabled={busy} className={s.button}>
          {busy ? "جارٍ حفظ القرار…" : "حفظ قرار المراجعة"}
        </button>
      </form>
    </article>
  );
}
export function Admin() {
  const session = useSession();
  const [tab, setTab] = useState("producers");
  const [producers, setProducers] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("review");
  const [query, setQuery] = useState("");
  const allowed = adminTabs.filter(([, , permission]) =>
    permission === "owner"
      ? session.user?.role === "admin"
      : can(session.user, permission),
  );
  // المشرف يبدأ بأول قسم مسموح له.
  const active = allowed.some(([id]) => id === tab) ? tab : allowed[0]?.[0];
  async function load() {
    const d = await api<{ producers: Application[] }>("/api/admin/producers");
    setProducers(d.producers);
  }
  useEffect(() => {
    if (can(session.user, "producers"))
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user]);
  return (
    <AccountShell>
      <h1>إدارة المنصة</h1>
      <Guard {...session} admin />
      {isManager(session.user) && (
        <>
          <AdminSummary onOpen={setTab} />
          <nav className={s.adminNav} aria-label="أقسام الإدارة">
            {adminGroups.map(([group, ids]) => {
              const items = allowed.filter(([id]) => ids.includes(id));
              const coverage =
                ids.includes("locations") && can(session.user, "locations");
              if (!items.length && !coverage) return null;
              return (
                <div
                  key={group}
                  role="group"
                  aria-label={group}
                  className={s.adminNavGroup}
                >
                  {items.map(([id, label]) => (
                    <button
                      type="button"
                      className={s.adminNavItem}
                      key={id}
                      aria-pressed={active === id}
                      onClick={() => setTab(id)}
                      onPointerEnter={() => prefetchAdmin(tabData[id] ?? [])}
                      onFocus={() => prefetchAdmin(tabData[id] ?? [])}
                    >
                      <AdminIcon name={id} />
                      <span>{label}</span>
                    </button>
                  ))}
                  {coverage && (
                    // تنقّل داخل الموقع بلا إعادة تحميل، وبياناتها تُحمَّل مسبقًا عند المرور.
                    <Link
                      className={s.adminNavItem}
                      href="/admin/coverage"
                      onPointerEnter={() => prefetchAdmin([COVERAGE_URL])}
                      onFocus={() => prefetchAdmin([COVERAGE_URL])}
                    >
                      <AdminIcon name="coverage" />
                      <span>إدارة التغطية التفصيلية</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
          {active === "members" ? (
            <MembersAdmin />
          ) : active === "orders" ? (
            <OrdersAdmin />
          ) : active === "products" ? (
            <ProductsAdmin />
          ) : active === "categories" ? (
            <>
              <CategoriesAdmin />
              <ProductFieldsAdmin />
            </>
          ) : active === "locations" ? (
            <LocationsAdmin />
          ) : active === "reports" ? (
            <ReportsAdmin />
          ) : active === "template" ? (
            <TemplateAdmin />
          ) : active === "texts" ? (
            <TextsAdmin />
          ) : active === "app" ? (
            <AppLinksAdmin />
          ) : active === "review" ? (
            <StoreReviewAdmin />
          ) : active !== "producers" ? (
            <p className={s.notice}>
              لا توجد أقسام مسموحة لحسابك بعد؛ تواصل مع مدير المنصة.
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
                      : producers.filter((p) => stateOf(p).key === id).length}
                    )
                  </button>
                ))}
              </div>
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
                      (filter === "all" || stateOf(p).key === filter) &&
                      (!q ||
                        [p.name, p.tradeName, p.ownerName, p.phone, p.cityName]
                          .filter(Boolean)
                          .some((v) => String(v).toLowerCase().includes(q))),
                  );
                  return shown.length ? (
                    shown.map((p) => (
                      <Review
                        key={p.id}
                        producer={p}
                        onSaved={async () => {
                          await load();
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
    </AccountShell>
  );
}
