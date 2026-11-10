"use client";
import { useEffect, useState } from "react";
import {
  AdminSummary,
  CategoriesAdmin,
  LocationsAdmin,
  OrdersAdmin,
  ProductsAdmin,
  ReportsAdmin,
  TemplateAdmin,
  TextsAdmin,
} from "./admin-tools";
import { familyAccountState, type FamilyState } from "@/lib/family-status";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
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
  async function load() {
    const d = await api<{ producers: Application[] }>("/api/admin/producers");
    setProducers(d.producers);
  }
  useEffect(() => {
    if (session.user?.role === "admin")
      load()
        .catch((e) => setError(e.message))
        .finally(() => setLoaded(true));
  }, [session.user]);
  return (
    <AccountShell>
      <h1>إدارة المنصة</h1>
      <Guard {...session} admin />
      {session.user?.role === "admin" && (
        <>
          <AdminSummary onOpen={setTab} />
          <nav className={s.actions} aria-label="أقسام الإدارة">
            <a className={s.button} href="/admin/coverage">
              إدارة التغطية التفصيلية
            </a>
            {[
              ["producers", "مراجعة الأسر"],
              ["orders", "الطلبات"],
              ["products", "المنتجات"],
              ["categories", "إدارة الأقسام"],
              ["locations", "المواقع"],
              ["reports", "البلاغات"],
              ["template", "قالب الموقع"],
              ["texts", "نصوص الموقع"],
            ].map(([id, label]) => (
              <button
                type="button"
                className={s.button}
                key={id}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "orders" ? (
            <OrdersAdmin />
          ) : tab === "products" ? (
            <ProductsAdmin />
          ) : tab === "categories" ? (
            <CategoriesAdmin />
          ) : tab === "locations" ? (
            <LocationsAdmin />
          ) : tab === "reports" ? (
            <ReportsAdmin />
          ) : tab === "template" ? (
            <TemplateAdmin />
          ) : tab === "texts" ? (
            <TextsAdmin />
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
