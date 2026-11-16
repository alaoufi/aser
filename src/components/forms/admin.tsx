"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COVERAGE_URL } from "./admin-cache";
import {
  AdminSummary,
  AppLinksAdmin,
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
  prefetchAdmin,
} from "./admin-tools";
import { familyAccountState, type FamilyState } from "@/lib/family-status";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import { ownAccountHref } from "@/components/public/account-link";
import { can, isManager, type AdminPermission } from "@/lib/permissions";
import { MembersAdmin } from "./members";
import { SectionIcon as AdminIcon } from "./section-icon";
import { APPROVALS_CHANGED } from "@/components/public/approval-alert";
import { AdminCouriers } from "./courier";
import { ContractsAdmin } from "./subscriptions";
import { SecurityLog } from "./security-log";

/** بيانات كل قسم، تُحمَّل مسبقًا عند المرور على زره أو التركيز عليه. */
const tabData: Record<string, string[]> = {
  orders: ["/api/admin/orders"],
  products: ["/api/admin/products", "/api/admin/categories"],
  categories: ["/api/admin/categories", "/api/admin/product-fields"],
  locations: ["/api/admin/locations"],
  reports: ["/api/admin/reports"],
  contracts: ["/api/admin/contracts"],
  template: ["/api/admin/settings"],
  texts: ["/api/admin/texts"],
  app: ["/api/admin/app-links"],
  review: ["/api/admin/store-review"],
  members: ["/api/admin/members?q="],
  security: ["/api/admin/security"],
};
/** أقسام الإدارة وصلاحية كل قسم؛ «الأعضاء» للمدير الكامل فقط. */
const adminTabs: [
  id: string,
  label: string,
  permission: AdminPermission | "owner",
][] = [
  ["approvals", "اعتماد الأسر والمندوبين", "producers"],
  ["producers", "الأسر المنتجة", "producers"],
  ["orders", "الطلبات", "orders"],
  ["products", "المنتجات", "products"],
  ["categories", "إدارة الأقسام", "categories"],
  ["locations", "المواقع", "locations"],
  ["reports", "البلاغات", "reports"],
  ["contracts", "عقود الاشتراكات", "orders"],
  ["template", "قالب الموقع", "content"],
  ["texts", "نصوص الموقع", "content"],
  ["app", "تطبيق الجوال", "content"],
  ["review", "مراجعة المتاجر", "owner"],
  ["members", "الأعضاء والصلاحيات", "owner"],
  ["suggestions", "الاقتراحات", "owner"],
  ["security", "سجل الأمان", "owner"],
];
/** تجميع الأقسام في شاشة الإدارة (الأسماء للقارئ الآلي فقط). */
const adminGroups: [group: string, ids: string[]][] = [
  [
    "الأسر والطلبات",
    ["approvals", "producers", "orders", "products", "reports", "contracts"],
  ],
  ["الأقسام والمواقع", ["categories", "locations"]],
  [
    "الموقع والأعضاء",
    [
      "template",
      "texts",
      "app",
      "review",
      "members",
      "suggestions",
      "security",
    ],
  ],
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
const documentLabels: Record<string, string> = {
  producer_certificate: "شهادة أسرة منتجة",
  national_id: "صورة الهوية الوطنية",
  freelance: "وثيقة عمل حر",
  commercial_registration: "سجل تجاري",
  other_document: "شهادة أو مستند آخر",
  exception: "طلب استثناء إداري",
};
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
            <option value="approved">
              تفعيل الحساب (ولو دون مستندات، مع ذكر النواقص في الملاحظة)
            </option>
            <option value="rejected">
              طلب استكمال النواقص قبل التفعيل (الحساب لا يظهر للعملاء)
            </option>
            <option value="suspended">إيقاف الحساب</option>
          </select>
        </label>
        <label className={s.field}>
          {decision === "approved"
            ? "ملاحظة للأسرة المنتجة (اختيارية عند التفعيل؛ تظهر لها أعلى صفحتها)"
            : "ملاحظة للأسرة المنتجة (مطلوبة: اذكر النواقص أو سبب القرار؛ تظهر لها أعلى صفحتها)"}
          <textarea
            name="reason"
            required={decision !== "approved"}
            minLength={decision === "approved" ? undefined : 5}
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
            required={decision === "approved"}
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
export function Admin() {
  const session = useSession();
  const [tab, setTab] = useState("approvals");
  const [producers, setProducers] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  // القائمة تُغلق بالضغط خارجها أو بزر Esc.
  useEffect(() => {
    const close = (e: Event) => {
      const d = menu.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        d.open = false;
        d.querySelector("summary")?.focus();
      } else if (!d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
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
  // رابط التنبيه «أسرة تنتظر الاعتماد» يفتح التبويب مباشرة: /admin?tab=approvals
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && adminTabs.some(([id]) => id === wanted)) setTab(wanted);
  }, []);
  const waiting = producers.filter((p) => p.status === "pending");
  useEffect(() => {
    if (can(session.user, "producers"))
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user]);
  return (
    // حساب الإدارة منفصل عن الحساب الخاص: لا روابط «طلباتي» و«معلوماتي» هنا.
    <AccountShell navigation={false}>
      <div className={s.actions}>
        <h1>حساب الإدارة</h1>
        {/* الرجوع للحساب الخاص: لوحة الأسرة إن كان له أسرة، وإلا طلباته. */}
        <Link href={ownAccountHref(session.user)} className={s.buttonSecondary}>
          ← الرجوع لحسابي الخاص
        </Link>
      </div>
      <Guard {...session} admin />
      {isManager(session.user) && (
        <>
          <AdminSummary onOpen={setTab} />
          {/* أقسام الإدارة قائمة منسدلة: زرها يحمل القسم الحالي، وتحتها الأقسام بمجموعاتها. */}
          <nav className={s.adminMenu} aria-label="أقسام الإدارة">
            <details className={s.adminMenuDetails} ref={menu}>
              <summary className={s.adminMenuButton}>
                <AdminIcon name={active ?? "approvals"} />
                <span className={s.adminMenuCurrent}>
                  <small>القسم</small>
                  {allowed.find(([id]) => id === active)?.[1] ?? "اختر قسمًا"}
                </span>
                {waiting.length > 0 && active !== "approvals" && (
                  <span className={s.adminMenuAlert}>
                    {waiting.length} تنتظر الاعتماد
                  </span>
                )}
              </summary>
              <div className={s.adminMenuPanel}>
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
                      className={s.adminMenuGroup}
                    >
                      <p className={s.adminMenuGroupTitle} aria-hidden="true">
                        {group}
                      </p>
                      {items.map(([id, label]) => (
                        <button
                          type="button"
                          className={s.adminMenuItem}
                          key={id}
                          aria-pressed={active === id}
                          onClick={() => {
                            setTab(id);
                            if (menu.current) menu.current.open = false;
                          }}
                          onPointerEnter={() =>
                            prefetchAdmin(tabData[id] ?? [])
                          }
                          onFocus={() => prefetchAdmin(tabData[id] ?? [])}
                        >
                          <AdminIcon name={id} />
                          <span>{label}</span>
                          {id === "approvals" && waiting.length > 0 && (
                            <span className={s.adminMenuBadge}>
                              {waiting.length}
                              <span className="sr-only"> تنتظر الاعتماد</span>
                            </span>
                          )}
                        </button>
                      ))}
                      {coverage && (
                        // تنقّل داخل الموقع بلا إعادة تحميل، وبياناتها تُحمَّل مسبقًا عند المرور.
                        <Link
                          className={s.adminMenuItem}
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
              </div>
            </details>
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
          ) : active === "contracts" ? (
            <ContractsAdmin />
          ) : active === "security" ? (
            <SecurityLog />
          ) : active === "template" ? (
            <TemplateAdmin />
          ) : active === "texts" ? (
            <TextsAdmin />
          ) : active === "app" ? (
            <AppLinksAdmin />
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
                          window.dispatchEvent(new Event(APPROVALS_CHANGED));
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
