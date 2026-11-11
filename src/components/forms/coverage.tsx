"use client";
import { useEffect, useState } from "react";
import type {
  CoverageArea,
  CoverageNode,
  CoverageKind,
  CustomCoverageArea,
} from "@/server/coverage";
import { api, s, AccountShell, Guard, Message, useSession } from "./shared";
import { ZoneEditor } from "./zones";
import { adminCache, COVERAGE_URL, fetchAdmin } from "./admin-cache";
import { can } from "@/lib/permissions";
function Select({
  title,
  value,
  onChange,
  nodes,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  nodes: CoverageNode[];
}) {
  return (
    <label className={s.field}>
      <span className="sr-only">{title}</span>
      <select
        aria-label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{title}</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Picker({
  nodes,
  onPick,
  onCustom,
}: {
  nodes: CoverageNode[];
  onPick: (id: string) => void;
  onCustom: (area: CustomCoverageArea) => void;
}) {
  const [region, setRegion] = useState(""),
    [gov, setGov] = useState(""),
    [city, setCity] = useState(""),
    [center, setCenter] = useState(""),
    [hood, setHood] = useState(""),
    [centerName, setCenterName] = useState(""),
    [neighborhoodName, setNeighborhoodName] = useState(""),
    [customKind, setCustomKind] = useState<"neighborhood" | "center">(
      "neighborhood",
    );
  const descendants = (id: string) => nodes.filter((n) => n.parentId === id);
  const cities =
    gov === "legacy" || !gov
      ? descendants(region).filter((n) => n.kind === "city")
      : descendants(gov);
  return (
    <>
      <div className={s.grid}>
        <Select
          title="المنطقة"
          nodes={nodes.filter((n) => n.kind === "region")}
          value={region}
          onChange={(v) => {
            setRegion(v);
            setGov("");
            setCity("");
            setCenter("");
            setHood("");
            setCenterName("");
            setNeighborhoodName("");
          }}
        />
        <label className={s.field}>
          <span className="sr-only">المحافظة</span>
          <select
            aria-label="المحافظة"
            value={gov}
            onChange={(e) => {
              setGov(e.target.value);
              setCity("");
              setCenter("");
              setHood("");
              setCenterName("");
              setNeighborhoodName("");
            }}
          >
            <option value="">المحافظة (اختياري)</option>
            {descendants(region)
              .filter((n) => n.kind === "governorate")
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            {descendants(region).some((n) => n.kind === "city") && (
              <option value="legacy">مدن المنطقة</option>
            )}
          </select>
        </label>
        <Select
          title="المدينة"
          nodes={cities}
          value={city}
          onChange={(v) => {
            setCity(v);
            setCenter("");
            setHood("");
            setCenterName("");
            setNeighborhoodName("");
          }}
        />
        {descendants(city).some((n) => n.kind === "neighborhood") && (
          <Select
            title="الحي — داخل المدينة (اختياري)"
            nodes={descendants(city).filter((n) => n.kind === "neighborhood")}
            value={center ? "" : hood}
            onChange={(v) => {
              setHood(v);
              setCenter("");
            }}
          />
        )}
        {descendants(city).some((n) => n.kind === "center") && (
          <Select
            title="المركز — خارج المدينة (اختياري)"
            nodes={descendants(city).filter((n) => n.kind === "center")}
            value={center}
            onChange={(v) => {
              setCenter(v);
              setHood("");
            }}
          />
        )}
        {/* أحياء قديمة سُجّلت تحت مركز تبقى قابلة للاختيار. */}
        {center &&
          descendants(center).some((n) => n.kind === "neighborhood") && (
            <Select
              title="حي تابع للمركز (اختياري)"
              nodes={descendants(center).filter(
                (n) => n.kind === "neighborhood",
              )}
              value={hood}
              onChange={setHood}
            />
          )}
      </div>
      <button
        className={s.button}
        type="button"
        disabled={!city}
        onClick={() => onPick(hood || center || city)}
      >
        {hood || center ? "أضف إلى التغطية" : "أضف المدينة كاملة"}
      </button>
      {city && (
        <fieldset className={s.coverageArea}>
          <legend>
            الأحياء والمراكز التي تخدمها في{" "}
            {nodes.find((n) => n.id === city)?.name}
          </legend>
          <p>
            لم تجد اسمه في القائمة؟ اختر نوعه واكتب اسمه، ثم كرر لإضافة بقية
            نطاقاتك. الحي داخل نطاق المدينة، والمركز خارجه.
          </p>
          <div className={s.grid}>
            <label className={s.field}>
              <span className="sr-only">نوع النطاق</span>
              <select
                aria-label="نوع النطاق"
                value={customKind}
                onChange={(e) =>
                  setCustomKind(e.target.value as "neighborhood" | "center")
                }
              >
                <option value="neighborhood">حي — داخل المدينة</option>
                <option value="center">مركز — خارج المدينة</option>
              </select>
            </label>
            <label className={s.field}>
              {customKind === "center" ? "اسم المركز" : "اسم الحي"}
              <input
                value={customKind === "center" ? centerName : neighborhoodName}
                onChange={(e) =>
                  customKind === "center"
                    ? setCenterName(e.target.value)
                    : setNeighborhoodName(e.target.value)
                }
                maxLength={120}
                autoComplete="off"
                placeholder={
                  customKind === "center"
                    ? "اسم المركز الذي تخدمه"
                    : "اسم الحي الذي تخدمه"
                }
              />
            </label>
          </div>
          <button
            type="button"
            className={s.button}
            disabled={
              !(customKind === "center" ? centerName : neighborhoodName).trim()
            }
            onClick={() => {
              onCustom({
                cityNodeId: city,
                center: customKind === "center" ? centerName.trim() : null,
                neighborhood:
                  customKind === "neighborhood"
                    ? neighborhoodName.trim()
                    : null,
                fee: null,
              });
              setCenterName("");
              setNeighborhoodName("");
            }}
          >
            {customKind === "center" ? "أضف المركز" : "أضف الحي"}
          </button>
        </fieldset>
      )}
    </>
  );
}
export function CoverageForm() {
  const session = useSession();
  const [nodes, setNodes] = useState<CoverageNode[]>([]),
    [areas, setAreas] = useState<CoverageArea[]>([]),
    [customAreas, setCustomAreas] = useState<CustomCoverageArea[]>([]),
    [legacy, setLegacy] = useState<{ label: string; fee: number | null }[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    if (!session.user) return;
    Promise.all([
      api<{ nodes: CoverageNode[] }>("/api/coverage"),
      api<{
        areas: CoverageArea[];
        customAreas?: CustomCoverageArea[];
        legacyAreas: typeof legacy;
      }>("/api/producer/coverage"),
    ])
      .then(([tree, data]) => {
        setNodes(tree.nodes);
        setAreas(data.areas);
        setCustomAreas(data.customAreas ?? []);
        setLegacy(data.legacyAreas);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [session.user]);
  return (
    <AccountShell>
      <h1>نطاق التغطية</h1>
      <Guard {...session} />
      <Message error={error} success={success} />
      {session.user && loaded && (
        <form
          className={s.form}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSuccess("");
            try {
              await api("/api/producer/coverage", {
                method: "PUT",
                body: JSON.stringify({
                  areas,
                  customAreas: customAreas.map(
                    ({ cityNodeId, center, neighborhood, fee }) => ({
                      cityNodeId,
                      center,
                      neighborhood,
                      fee,
                    }),
                  ),
                }),
              });
              setSuccess("تم حفظ نطاقات التغطية");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            اختر المنطقة ثم المدينة، وأضف الأحياء والمراكز التي تخدمها. يمكنك
            إضافة أكثر من نطاق. رسوم التوصيل اختيارية والاتفاق النهائي مع الأسرة
            المنتجة خارج الموقع.
          </p>
          <Picker
            nodes={nodes}
            onCustom={(area) =>
              setCustomAreas((old) =>
                old.some(
                  (a) =>
                    a.cityNodeId === area.cityNodeId &&
                    (a.center || "").normalize("NFC").toLowerCase() ===
                      (area.center || "").normalize("NFC").toLowerCase() &&
                    (a.neighborhood || "").normalize("NFC").toLowerCase() ===
                      (area.neighborhood || "").normalize("NFC").toLowerCase(),
                )
                  ? old
                  : [...old, area],
              )
            }
            onPick={(id) =>
              setAreas((a) =>
                a.some((x) => x.nodeId === id)
                  ? a
                  : [...a, { nodeId: id, fee: null }],
              )
            }
          />
          {customAreas.map((area, index) => (
            <fieldset
              className={s.coverageArea}
              key={JSON.stringify([
                area.cityNodeId,
                area.center,
                area.neighborhood,
              ])}
            >
              <legend>
                {[
                  nodes.find((n) => n.id === area.cityNodeId)?.name ||
                    area.cityNodeId,
                  area.center,
                  area.neighborhood,
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </legend>
              <label className={s.field}>
                رسوم التوصيل (ريال، اختيارية)
                <input
                  type="number"
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  value={area.fee ?? ""}
                  onChange={(e) =>
                    setCustomAreas((old) =>
                      old.map((a, i) =>
                        i === index
                          ? {
                              ...a,
                              fee:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : a,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className={s.button}
                onClick={() =>
                  setCustomAreas((old) => old.filter((_, i) => i !== index))
                }
              >
                إزالة {area.neighborhood || area.center}
              </button>
            </fieldset>
          ))}
          {areas.map((a, i) => (
            <fieldset className={s.coverageArea} key={a.nodeId}>
              <legend>
                {nodes.find((n) => n.id === a.nodeId)?.label ?? a.nodeId}
              </legend>
              <label className={s.field}>
                رسوم التوصيل (ريال، اختيارية)
                <input
                  type="number"
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  value={a.fee ?? ""}
                  onChange={(e) =>
                    setAreas((old) =>
                      old.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              fee:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className={s.button}
                onClick={() =>
                  setAreas((old) => old.filter((x) => x.nodeId !== a.nodeId))
                }
              >
                إزالة {nodes.find((n) => n.id === a.nodeId)?.name}
              </button>
            </fieldset>
          ))}
          {!!legacy.length && (
            <p>
              تغطية التوصيل السابقة محفوظة وتدار من ملف الأسرة المنتجة:{" "}
              {legacy.map((a) => a.label).join("، ")}
            </p>
          )}
          <button className={s.button} disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ التغطية"}
          </button>
        </form>
      )}
      {session.user && <ZoneEditor />}
    </AccountShell>
  );
}
export function CoverageAdmin() {
  const session = useSession();
  const cached = adminCache.get(COVERAGE_URL) as
    { nodes: CoverageNode[] } | undefined;
  const [nodes, setNodes] = useState<CoverageNode[] | null>(
      cached?.nodes ?? null,
    ),
    [kind, setKind] = useState<Exclude<CoverageKind, "region">>("governorate"),
    [parent, setParent] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const load = (fresh = false) =>
    (fresh
      ? api<{ nodes: CoverageNode[] }>(COVERAGE_URL)
      : fetchAdmin<{ nodes: CoverageNode[] }>(COVERAGE_URL)
    ).then((d) => {
      adminCache.set(COVERAGE_URL, d);
      setNodes(d.nodes);
    });
  // تُطلب البيانات فورًا مع طلب الجلسة لا بعده؛ الخادم يتحقق من الدخول.
  useEffect(() => {
    load().catch(() => {});
  }, []);
  const all = nodes ?? [];
  const parents = all.filter((n) =>
    kind === "governorate"
      ? n.kind === "region"
      : kind === "city"
        ? n.kind === "governorate"
        : kind === "center"
          ? n.kind === "city" && !n.legacy
          : n.kind === "city" && !n.legacy,
  );
  return (
    <AccountShell>
      <h1>التصنيف الإداري للتغطية</h1>
      <Guard {...session} admin />
      <Message error={error} success={success} />
      {can(session.user, "locations") && (
        <>
          <p>
            أضف التصنيف بناءً على معلومات معتمدة فقط. ربط المدينة بالمحافظة يحفظ
            معرفها وتغطياتها السابقة؛ لا يمكن نقلها بعد التصنيف من هذه الواجهة.
          </p>
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              setBusy(true);
              setError("");
              setSuccess("");
              try {
                await api("/api/admin/coverage", {
                  method: "POST",
                  body: JSON.stringify({
                    kind,
                    parentId: parent,
                    ...(kind === "city"
                      ? { cityId: f.get("cityId") }
                      : { name: f.get("name") }),
                  }),
                });
                await load(true);
                form.reset();
                setSuccess("تم حفظ التصنيف وتسجيل العملية");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className={s.field}>
              <span className="sr-only">المستوى الإداري</span>
              <select
                aria-label="المستوى الإداري"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as typeof kind);
                  setParent("");
                }}
              >
                <option value="governorate">إضافة محافظة</option>
                <option value="city">ربط مدينة قائمة بمحافظة</option>
                <option value="neighborhood">
                  إضافة حي (داخل نطاق المدينة)
                </option>
                <option value="center">إضافة مركز (خارج نطاق المدينة)</option>
              </select>
            </label>
            <label className={s.field}>
              <span className="sr-only">التصنيف الأب</span>
              <select
                aria-label="التصنيف الأب"
                required
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                <option value="">التصنيف الأب</option>
                {parents.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "city" ? (
              <label className={s.field}>
                <span className="sr-only">المدينة القائمة</span>
                <select
                  aria-label="المدينة القائمة"
                  name="cityId"
                  required
                  key={parent}
                >
                  <option value="">المدينة القائمة غير المصنفة</option>
                  {all
                    .filter(
                      (n) =>
                        n.kind === "city" &&
                        n.legacy &&
                        n.regionId ===
                          all.find((p) => p.id === parent)?.regionId,
                    )
                    .map((n) => (
                      <option key={n.id} value={n.cityId!}>
                        {n.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label className={s.field}>
                الاسم
                <input name="name" maxLength={120} required />
              </label>
            )}
            <button className={s.button} disabled={busy || !parent}>
              {busy ? "جارٍ الحفظ…" : "حفظ التصنيف"}
            </button>
          </form>
          {!nodes && <p role="status">جارٍ تحميل التغطية…</p>}
          <ul>
            {all
              .filter((n) => n.kind !== "region" && !n.legacy)
              .map((n) => (
                <li key={n.id}>{n.label}</li>
              ))}
          </ul>
        </>
      )}
    </AccountShell>
  );
}
