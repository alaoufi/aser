"use client";
import { telHref, whatsappHref } from "@/lib/phone-links";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { enterNext } from "./enter-next";
import { FolderTabs } from "./folder-tabs";
import { useTx } from "@/components/site-texts";
import {
  AccountShell,
  Guard,
  Message,
  api,
  isFamilyAccount,
  s,
  useSession,
} from "./shared";

/**
 * «طلبات العملاء» (قرار المالك 2026-11-22):
 *   - العميل: «اطلب» (زر + في القائمة السفلية) ينشر ما يريد، ويختار ما يظهر من اسمه وجواله وواتسابه
 *     (لا شيء منها يظهر بلا موافقته)، ويغلق طلبه متى شاء.
 *   - الأسرة المعتمدة: ترى الطلبات المفتوحة، وتفلترها بـ«منطقتي» و«مشابه لمنتجاتي»، وتراسل صاحب الطلب.
 */
type Req = {
  id: string;
  body: string;
  categoryName: string | null;
  cityName: string;
  people: number | null;
  neededOn: string | null;
  createdAt: string;
  status: "open" | "closed" | "expired";
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  mine: boolean;
};
type Option = { id: string; name: string };
const when = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

export function CustomerRequests({
  cities,
  categories,
}: {
  cities: (Option & { regionName: string })[];
  categories: Option[];
}) {
  const session = useSession();
  const family = isFamilyAccount(session.user);
  return (
    <AccountShell>
      <Guard {...session} />
      {session.user &&
        (family ? (
          <FamilyRequests cities={cities} categories={categories} />
        ) : session.user.role === "courier" ? (
          <p className={s.notice}>طلبات العملاء للأسر المنتجة والعملاء.</p>
        ) : (
          <CustomerSide cities={cities} categories={categories} />
        ))}
    </AccountShell>
  );
}

/**
 * الأسرة في «الطلبات» (قرار المالك 2026-11-26): ترى طلبات العملاء لتعرض عليهم، وتطلب هي
 * من الأسر الأخرى كأي عميل («اطلب من الأسر»؛ رابط مباشر /requests#ask).
 */
function FamilyRequests({
  cities,
  categories,
}: {
  cities: (Option & { regionName: string })[];
  categories: Option[];
}) {
  const { txb } = useTx();
  const [tab, setTab] = useState<"board" | "ask">("board");
  useEffect(() => {
    const fromHash = () => setTab(location.hash === "#ask" ? "ask" : "board");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("popstate", fromHash);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("popstate", fromHash);
    };
  }, []);
  return (
    <FolderTabs
      label={txb("asCustomer.requestsTabs")}
      tabs={[
        { id: "board", label: txb("asCustomer.board") },
        { id: "ask", label: txb("asCustomer.ask") },
      ]}
      active={tab}
      onSelect={(id) => {
        setTab(id as "board" | "ask");
        history.replaceState(
          null,
          "",
          id === "ask" ? "#ask" : location.pathname + location.search,
        );
      }}
    >
      {tab === "board" ? (
        <FamilyBoard />
      ) : (
        <CustomerSide cities={cities} categories={categories} />
      )}
    </FolderTabs>
  );
}

function RequestCard({ r, children }: { r: Req; children?: React.ReactNode }) {
  return (
    <li className={`${s.card} request-card`}>
      <p className="request-body">{r.body}</p>
      <p className={s.muted}>
        {[
          r.categoryName,
          r.cityName,
          r.people ? `${r.people} أشخاص` : null,
          r.neededOn ? `يوم ${when(r.neededOn)}` : null,
          `نُشر ${when(r.createdAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="request-who">
        {r.name ?? "عميل"}
        {r.status === "closed" && (
          <span className="request-closed"> · مغلق</span>
        )}
        {r.status === "expired" && (
          <span className="request-closed">
            {" "}
            · انتهت مدته، ولم يعد ظاهرًا للأسر
          </span>
        )}
      </p>
      {children}
    </li>
  );
}

function CustomerSide({
  cities,
  categories,
}: {
  cities: (Option & { regionName: string })[];
  categories: Option[];
}) {
  const [list, setList] = useState<Req[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showWa, setShowWa] = useState(false);
  const load = () =>
    api<{ requests: Req[] }>("/api/requests")
      .then((d) => setList(d.requests))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("new") === "1")
      requestAnimationFrame(() =>
        document.getElementById("request-body")?.focus(),
      );
  }, []);
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/requests", {
        method: "POST",
        saved: "تم نشر طلبك",
        body: JSON.stringify({
          body: f.get("body"),
          categoryId: f.get("categoryId") || null,
          cityId: f.get("cityId"),
          people: f.get("people") || null,
          neededOn: f.get("neededOn") || null,
          showName: f.get("showName") === "on",
          showPhone: f.get("showPhone") === "on",
          showWhatsapp: f.get("showWhatsapp") === "on",
          whatsapp: f.get("whatsapp") || null,
        }),
      });
      form.reset();
      setShowWa(false);
      setSuccess("✓ نُشر طلبك، وتراه الأسر المنتجة وتراسلك عليه.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="requests-title">
      <h1 id="requests-title">اطلب من الأسر</h1>
      <p className={s.muted}>
        اكتب ما تريد، فتراه الأسر المنتجة وتراسلك عليه من الموقع. اسمك وجوالك
        وواتسابك لا تظهر إلا إذا اخترت ذلك.
      </p>
      <Message error={error} success={success} />
      <form
        className={`${s.card} ${s.form} compact-form`}
        onSubmit={submit}
        onKeyDown={enterNext}
      >
        <label className={s.field}>
          <span>وش تطلب؟</span>
          <textarea
            id="request-body"
            name="body"
            required
            minLength={3}
            maxLength={500}
            placeholder="مثل: جريش لعشرة أشخاص يوم الخميس"
          />
        </label>
        <div className="request-row">
          <label className={s.field}>
            <span>المدينة</span>
            <select name="cityId" required defaultValue="">
              <option value="" disabled>
                اختر المدينة
              </option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.regionName})
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span>القسم (اختياري)</span>
            <select name="categoryId" defaultValue="">
              <option value="">بلا قسم</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {/* خانة «اليوم» أُلغيت (طلب المالك 2026-11-24: لا تواريخ، حقول أقل): يُكتب اليوم في نص الطلب. */}
          <label className={s.field}>
            <span>عدد الأشخاص (اختياري)</span>
            <input
              name="people"
              type="number"
              min={1}
              max={1000}
              inputMode="numeric"
            />
          </label>
        </div>
        <fieldset className="request-consent">
          <legend>ما يظهر للأسر (اختياري)</legend>
          <label>
            <input type="checkbox" name="showName" /> اسمي
          </label>
          <label>
            <input type="checkbox" name="showPhone" /> جوالي
          </label>
          <label>
            <input
              type="checkbox"
              name="showWhatsapp"
              onChange={(e) => setShowWa(e.target.checked)}
            />{" "}
            واتساب
          </label>
          {showWa && (
            <label className={s.field}>
              <span>رقم واتساب</span>
              <input
                name="whatsapp"
                inputMode="tel"
                dir="ltr"
                required
                maxLength={30}
                placeholder="05xxxxxxxx"
              />
            </label>
          )}
          <small className={s.muted}>
            بلا اختيار: يظهر «عميل» فقط، وتراسلك الأسر من الموقع.
          </small>
        </fieldset>
        <div className={s.actions}>
          <button type="submit" className={s.button} disabled={busy}>
            {busy ? "جارٍ النشر…" : "انشر طلبي"}
          </button>
        </div>
      </form>
      <h2>طلباتي المنشورة</h2>
      {!list ? (
        <p role="status">جارٍ التحميل…</p>
      ) : !list.length ? (
        <p className={s.muted}>لا طلبات بعد.</p>
      ) : (
        <ul className="request-list">
          {list.map((r) => (
            <RequestCard key={r.id} r={r}>
              {r.status === "open" && (
                <button
                  type="button"
                  className={s.buttonSecondary}
                  onClick={async () => {
                    if (!window.confirm("إغلاق الطلب؟ لن تراه الأسر بعدها."))
                      return;
                    try {
                      await api(`/api/requests/${r.id}`, {
                        method: "DELETE",
                        saved: "تم إغلاق الطلب",
                      });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  أغلق الطلب
                </button>
              )}
            </RequestCard>
          ))}
        </ul>
      )}
    </section>
  );
}

function FamilyBoard() {
  const router = useRouter();
  const [mine, setMine] = useState<string[]>([]);
  const [list, setList] = useState<Req[] | null>(null);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const q = new URLSearchParams({
      scope: "open",
      ...(mine.length ? { mine: mine.join(",") } : {}),
    });
    api<{ requests: Req[]; summary: string }>(`/api/requests?${q}`)
      .then((d) => {
        setList(d.requests);
        setSummary(d.summary);
      })
      .catch((e) => setError(e.message));
  }, [mine]);
  const toggle = (k: string) =>
    setMine((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  return (
    <section aria-labelledby="requests-title">
      <h1 id="requests-title">طلبات العملاء</h1>
      <p className={s.muted}>
        ما ينشره العملاء ويبحثون له عن أسرة. راسل صاحب الطلب واتفق معه.
      </p>
      <nav className="mine-bar" aria-label="اعرض لي">
        <div className="mine-panel">
          <span className="mine-title" aria-hidden="true">
            اعرض لي
          </span>
          <div className="mine-segments">
            {[
              ["similar", "مشابه لمنتجاتي"],
              ["area", "منطقتي"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="mine-seg"
                role="checkbox"
                aria-checked={mine.includes(k)}
                onClick={() => toggle(k)}
              >
                <span className="mine-box" aria-hidden="true">
                  {mine.includes(k) ? "✓" : ""}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
        {summary && (
          <p className="mine-note" role="status">
            {summary}
          </p>
        )}
      </nav>
      <Message error={error} />
      {!list ? (
        <p role="status">جارٍ التحميل…</p>
      ) : !list.length ? (
        <p className={s.notice}>
          لا طلبات مفتوحة الآن{mine.length ? " بهذه الخيارات" : ""}.
        </p>
      ) : (
        <ul className="request-list">
          {list.map((r) => (
            <RequestCard key={r.id} r={r}>
              <div className="request-contact">
                <button
                  type="button"
                  className={s.button}
                  onClick={async () => {
                    try {
                      const d = await api<{ id: string }>(
                        "/api/conversations",
                        {
                          method: "POST",
                          body: JSON.stringify({ request: r.id }),
                        },
                      );
                      router.push(`/messages?c=${encodeURIComponent(d.id)}`);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  راسل صاحب الطلب
                </button>
                {r.phone && (
                  <a
                    className={s.buttonSecondary}
                    href={telHref(r.phone) ?? undefined}
                  >
                    اتصال
                  </a>
                )}
                {r.whatsapp && whatsappHref(r.whatsapp) && (
                  <a
                    className={s.buttonSecondary}
                    href={whatsappHref(r.whatsapp) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    واتساب
                  </a>
                )}
              </div>
            </RequestCard>
          ))}
        </ul>
      )}
    </section>
  );
}
