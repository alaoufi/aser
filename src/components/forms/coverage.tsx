"use client";
import { useEffect, useState } from "react";
import type {
  CoverageArea,
  CoverageNode,
  CoverageKind,
} from "@/server/coverage";
import { api, s, AccountShell, Guard, Message, useSession } from "./shared";
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
}: {
  nodes: CoverageNode[];
  onPick: (id: string) => void;
}) {
  const [region, setRegion] = useState(""),
    [gov, setGov] = useState(""),
    [city, setCity] = useState(""),
    [center, setCenter] = useState(""),
    [hood, setHood] = useState("");
  const descendants = (id: string) => nodes.filter((n) => n.parentId === id);
  const cities =
    gov === "legacy"
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
            }}
          >
            <option value="">المحافظة</option>
            {descendants(region)
              .filter((n) => n.kind === "governorate")
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            {descendants(region).some((n) => n.kind === "city") && (
              <option value="legacy">
                مدن القائمة السابقة — غير مصنفة لمحافظة
              </option>
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
          }}
        />
        <Select
          title="المركز (اختياري)"
          nodes={descendants(city).filter((n) => n.kind === "center")}
          value={center}
          onChange={(v) => {
            setCenter(v);
            setHood("");
          }}
        />
        <Select
          title="الحي (اختياري)"
          nodes={descendants(center || city).filter(
            (n) => n.kind === "neighborhood",
          )}
          value={hood}
          onChange={setHood}
        />
      </div>
      <button
        className={s.button}
        type="button"
        disabled={!city}
        onClick={() => onPick(hood || center || city)}
      >
        أضف إلى التغطية
      </button>
    </>
  );
}
export function CoverageForm() {
  const session = useSession();
  const [nodes, setNodes] = useState<CoverageNode[]>([]),
    [areas, setAreas] = useState<CoverageArea[]>([]),
    [legacy, setLegacy] = useState<{ label: string; fee: number | null }[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    if (!session.user) return;
    Promise.all([
      api<{ nodes: CoverageNode[] }>("/api/coverage"),
      api<{ areas: CoverageArea[]; legacyAreas: typeof legacy }>(
        "/api/producer/coverage",
      ),
    ])
      .then(([tree, data]) => {
        setNodes(tree.nodes);
        setAreas(data.areas);
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
                body: JSON.stringify({ areas }),
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
            اختر عدة مدن أو مراكز أو أحياء. رسوم التوصيل اختيارية والاتفاق
            النهائي مع الأسرة خارج الموقع.
          </p>
          <Picker
            nodes={nodes}
            onPick={(id) =>
              setAreas((a) =>
                a.some((x) => x.nodeId === id)
                  ? a
                  : [...a, { nodeId: id, fee: null }],
              )
            }
          />
          {areas.map((a, i) => (
            <fieldset key={a.nodeId}>
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
              تغطية التوصيل السابقة محفوظة وتدار من ملف الأسرة:{" "}
              {legacy.map((a) => a.label).join("، ")}
            </p>
          )}
          <button className={s.button} disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ التغطية"}
          </button>
        </form>
      )}
    </AccountShell>
  );
}
export function CoverageAdmin() {
  const session = useSession();
  const [nodes, setNodes] = useState<CoverageNode[]>([]),
    [kind, setKind] = useState<Exclude<CoverageKind, "region">>("governorate"),
    [parent, setParent] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<{ nodes: CoverageNode[] }>("/api/admin/coverage").then((d) =>
      setNodes(d.nodes),
    );
  useEffect(() => {
    if (session.user?.role === "admin")
      load().catch((e) => setError(e.message));
  }, [session.user]);
  const parents = nodes.filter((n) =>
    kind === "governorate"
      ? n.kind === "region"
      : kind === "city"
        ? n.kind === "governorate"
        : kind === "center"
          ? n.kind === "city" && !n.legacy
          : (n.kind === "city" && !n.legacy) || n.kind === "center",
  );
  return (
    <AccountShell>
      <h1>التصنيف الإداري للتغطية</h1>
      <Guard {...session} admin />
      <Message error={error} success={success} />
      {session.user?.role === "admin" && (
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
                await load();
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
                <option value="center">إضافة مركز</option>
                <option value="neighborhood">إضافة حي</option>
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
                  {nodes
                    .filter(
                      (n) =>
                        n.kind === "city" &&
                        n.legacy &&
                        n.regionId ===
                          nodes.find((p) => p.id === parent)?.regionId,
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
          <ul>
            {nodes
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
