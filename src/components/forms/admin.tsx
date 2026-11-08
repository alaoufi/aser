"use client";
import { useEffect, useState } from "react";
import {
  CategoriesAdmin,
  LocationsAdmin,
  ProductsAdmin,
  ReportsAdmin,
} from "./admin-tools";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
type Application = {
  id: string;
  name: string;
  status: string;
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
      <span className={s.tag}>
        {(
          {
            pending: "قيد المراجعة",
            approved: "معتمد",
            rejected: "مرفوض",
            suspended: "معلق",
          } as Record<string, string>
        )[producer.status] || producer.status}
      </span>
      <h2>{producer.name}</h2>
      <p>{producer.cityName}</p>
      <p>{producer.description}</p>
      <p>نوع الإثبات: {producer.documentType || "راجع المستند المرفق"}</p>
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
            <option value="rejected">رفض</option>
            <option value="suspended">تعليق</option>
          </select>
        </label>
        <label className={s.field}>
          سبب القرار (يُحفظ في سجل المراجعة)
          <textarea name="reason" required minLength={3} maxLength={2000} />
        </label>
        <label className={s.checks}>
          <input
            name="eligibilityConfirmed"
            type="checkbox"
            required={decision === "approved"}
          />
          تحققت من أهلية النشاط واستيفاء التراخيص الإلزامية قبل الاعتماد.
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
  const [tab, setTab] = useState("producers");
  const [producers, setProducers] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [success, setSuccess] = useState("");
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
          <nav className={s.actions} aria-label="أقسام الإدارة">
            {[
              ["producers", "مراجعة الأسر"],
              ["products", "المنتجات"],
              ["categories", "التصنيفات"],
              ["locations", "المواقع"],
              ["reports", "البلاغات"],
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
          {tab === "products" ? (
            <ProductsAdmin />
          ) : tab === "categories" ? (
            <CategoriesAdmin />
          ) : tab === "locations" ? (
            <LocationsAdmin />
          ) : tab === "reports" ? (
            <ReportsAdmin />
          ) : (
            <>
              <p className={s.notice}>
                الهوية الوطنية ليست ترخيصًا. الاستثناء الإداري لا يعفي من
                التراخيص الإلزامية. قرار التوثيق إداري ولا يمثل اعتمادًا
                حكوميًا. المستندات خاصة ومخصصة للمراجعة فقط.
              </p>
              <Message error={error} success={success} />
              {!loaded ? (
                <p role="status">جارٍ تحميل طلبات المراجعة…</p>
              ) : producers.length ? (
                producers.map((p) => (
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
                <p className={s.notice}>لا توجد طلبات مراجعة حاليًا.</p>
              )}
            </>
          )}
        </>
      )}
    </AccountShell>
  );
}
