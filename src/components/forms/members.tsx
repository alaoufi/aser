"use client";
import { PasswordField } from "./password-field";
import { adminCache, fetchAdmin } from "./admin-cache";
import { useEffect, useState } from "react";
import { adminPermissions, type AdminPermission } from "@/lib/permissions";
import { NAV_GROUPS } from "@/lib/admin-nav";
import { Message, api, s, useSession } from "./shared";
import { useTx } from "@/components/site-texts";
import { TypedConfirm } from "./typed-confirm";

type Member = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "producer" | "admin" | "staff" | "courier";
  memberNo: number;
  permissions: string[];
  suspended: boolean;
  familyName: string | null;
  /** حالة ملف الأسرة إن وُجد ('closed': تحوّلت إلى عميل). */
  familyStatus?: string | null;
  /** حالة اعتماد المندوب إن كان مندوبًا. */
  courierStatus?: string | null;
  createdAt?: string;
};
type Access = { fullAdmin: boolean; permissions: string[] };

function accessLabel(m: Member) {
  const type = m.role === "producer" ? "أسرة منتجة" : "عضو";
  if (m.role === "admin") return "مدير عام";
  return m.permissions.length
    ? `${type} · مدير مخصص (${m.permissions.length} ${m.permissions.length <= 10 && m.permissions.length >= 3 ? "أقسام" : "قسمًا"})`
    : type;
}

/**
 * نوع الصلاحية (قرار المالك 2026-11-22): عضو عادي، أو «مدير مخصص» يُختار له من أقسام القائمة الجانبية
 * قسمًا قسمًا (مجمّعة مثل القائمة)، أو «مدير عام» له كل الأقسام (لغير الأسر).
 */
function AccessFields({
  initial,
  producer,
  onChange,
}: {
  initial: Access;
  producer: boolean;
  onChange: (a: Access) => void;
}) {
  const [mode, setMode] = useState<"none" | "limited" | "full">(
    initial.fullAdmin
      ? "full"
      : initial.permissions.length
        ? "limited"
        : "none",
  );
  const [perms, setPerms] = useState<string[]>(initial.permissions);
  const emit = (m: typeof mode, p: string[]) =>
    onChange({
      fullAdmin: m === "full",
      permissions: m === "limited" ? p : [],
    });
  return (
    <fieldset className={s.form}>
      <legend>الصلاحيات الإدارية</legend>
      <div className={s.checks}>
        {(
          [
            ["none", "عضو عادي (بلا صلاحيات إدارية)"],
            ["limited", "مدير مخصص (أقسام تختارها له)"],
            ["full", "مدير عام (كل الأقسام والأعضاء والصلاحيات)"],
          ] as const
        ).map(([id, label]) => (
          <label key={id}>
            <input
              type="radio"
              checked={mode === id}
              disabled={id === "full" && producer}
              onChange={() => {
                setMode(id);
                emit(id, perms);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      {producer && (
        <small>حساب الأسرة المنتجة يكون مديرًا مخصصًا ويبقى حساب أسرة.</small>
      )}
      {mode === "limited" && (
        <div className={s.permissionGroups}>
          <small>
            يرى في لوحة الإدارة لوحة التحكم والأقسام التي تختارها فقط. «الأعضاء
            والصلاحيات» للمدير العام وحده.
          </small>
          {NAV_GROUPS.map((g) => {
            const ids = g.items
              .map((it) => it.perm)
              .filter(
                (p): p is AdminPermission =>
                  typeof p === "string" && p in adminPermissions,
              );
            if (!ids.length) return null;
            const all = ids.every((id) => perms.includes(id));
            const set = (next: string[]) => {
              setPerms(next);
              emit("limited", next);
            };
            return (
              <fieldset key={g.label} className={s.permissionGroup}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={all}
                      aria-label={`${g.label}: المجموعة كلها`}
                      onChange={(e) =>
                        set(
                          e.target.checked
                            ? [...new Set([...perms, ...ids])]
                            : perms.filter(
                                (x) => !ids.includes(x as AdminPermission),
                              ),
                        )
                      }
                    />
                    {g.label}
                  </label>
                </legend>
                <div className={s.checks}>
                  {ids.map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={perms.includes(id)}
                        onChange={(e) =>
                          set(
                            e.target.checked
                              ? [...perms, id]
                              : perms.filter((x) => x !== id),
                          )
                        }
                      />
                      {adminPermissions[id]}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

/** قائمة الأعضاء بلا بحث؛ تُحفظ وتُحمَّل مسبقًا كبقية أقسام الإدارة. */
export const MEMBERS_URL = "/api/admin/members?q=";
type MemberTab =
  "add" | "all" | "new" | "suspended" | "families" | "customers" | "admins";
const TABS: MemberTab[] = [
  "all",
  "add",
  "new",
  "suspended",
  "families",
  "customers",
  "admins",
];
/** نوع الحساب في سطر العضو. */
/** حالة الاعتماد في التفاصيل: للأسرة والمندوب (قرار المالك 2026-11-28). */
function approvalKey(m: Member) {
  const st =
    m.familyStatus && m.familyStatus !== "closed"
      ? m.familyStatus
      : m.courierStatus;
  return st === "pending"
    ? ("members.approval.pending" as const)
    : st === "approved"
      ? ("members.approval.approved" as const)
      : st === "rejected"
        ? ("members.approval.rejected" as const)
        : st === "suspended"
          ? ("members.approval.suspended" as const)
          : st === "hidden"
            ? ("members.approval.hidden" as const)
            : null;
}

function accountType(m: Member, tx: ReturnType<typeof useTx>["tx"]) {
  if (m.role === "admin") return tx("members.type.admin");
  const family = Boolean(m.familyName) && m.familyStatus !== "closed";
  const base =
    m.role === "courier"
      ? tx("members.type.courier")
      : family
        ? tx("members.type.family")
        : tx("members.type.customer");
  return m.permissions.length ? `${base} · ${tx("members.type.staff")}` : base;
}
const day = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        timeZone: "Asia/Riyadh",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "";

/**
 * الأعضاء والصلاحيات (قرار المالك 2026-11-28): تبويبات (الكل، إضافة مستخدم، المسجلون خلال 24 ساعة،
 * الموقوفون، الأسر المنتجة، العملاء، الإدارة)، وسطر لكل عضو: الاسم والرقم ونوع الحساب،
 * وأمامه ⋮ فيه: تفاصيل، تعديل، إيقاف (أو تفعيل) — والإيقاف برسالة تأكيد.
 */
export function MembersAdmin() {
  const session = useSession();
  const { tx } = useTx();
  const [tab, setTab] = useState<MemberTab>("all");
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[] | null>(
    () =>
      (adminCache.get(MEMBERS_URL) as { members: Member[] } | undefined)
        ?.members ?? null,
  );
  const [counts, setCounts] = useState<Partial<Record<MemberTab, number>>>({});
  const [open, setOpen] = useState<{ id: string; mode: "details" | "edit" }>();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load(q = query, t: MemberTab = tab) {
    if (t === "add") return;
    const d =
      !q && t === "all"
        ? await fetchAdmin<{
            members: Member[];
            counts?: Partial<Record<MemberTab, number>>;
          }>(MEMBERS_URL)
        : await api<{
            members: Member[];
            counts?: Partial<Record<MemberTab, number>>;
          }>(
            `/api/admin/members?q=${encodeURIComponent(q)}&tab=${encodeURIComponent(t)}`,
          );
    setMembers(d.members);
    if (d.counts) setCounts(d.counts);
  }
  useEffect(() => {
    load("", "all").catch((e) => setError((e as Error).message));
  }, []);
  async function update(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/admin/members", {
        method: "PATCH",
        body: JSON.stringify(body),
        saved: done.replace(/[.،]+$/, ""),
      });
      await load();
      setSuccess(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const choose = (t: MemberTab) => {
    setTab(t);
    setOpen(undefined);
    setConfirm("");
    setError("");
    setSuccess("");
    if (t !== "add") {
      setMembers(null);
      load(query, t).catch((e) => setError((e as Error).message));
    }
  };
  const close = (e: React.MouseEvent) =>
    (
      e.currentTarget.closest("details") as HTMLDetailsElement | null
    )?.removeAttribute("open");
  return (
    <section>
      <h2>{tx("members.title")}</h2>
      <p className={s.muted}>{tx("members.intro")}</p>
      <div className={s.actions} role="tablist" aria-label={tx("members.tabs")}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? s.button : s.buttonSecondary}
            onClick={() => choose(t)}
          >
            {tx(`members.tab.${t}`)}
            {t !== "add" && counts[t] !== undefined ? ` (${counts[t]})` : ""}
          </button>
        ))}
      </div>
      <Message error={error} success={success} />
      {tab === "add" ? (
        <AddMember
          busy={busy}
          onAdd={async (body) => {
            if (
              await update(
                { action: "create", ...body },
                `تمت إضافة ${body.name}.`,
              )
            )
              choose("new");
          }}
        />
      ) : (
        <>
          <form
            className={s.actions}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              load().catch((err) => setError((err as Error).message));
            }}
          >
            <label className={s.field}>
              <span className="sr-only">ابحث عن عضو</span>
              <input
                type="search"
                aria-label="ابحث عن عضو"
                placeholder={tx("members.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className={s.button}>بحث</button>
          </form>
          {members === null ? (
            <p role="status">جارٍ تحميل الأعضاء…</p>
          ) : members.length === 0 ? (
            <p className={s.notice}>{tx("members.empty")}</p>
          ) : (
            <div>
              {members.map((m) => {
                const self = m.id === session.user?.id;
                const shown = open?.id === m.id ? open.mode : null;
                return (
                  <article
                    key={m.id}
                    className="family-row"
                    id={`member-row-${m.id}`}
                  >
                    <div className="family-row-line">
                      <span className="family-row-name">
                        <strong>
                          {m.name}
                          {self ? ` ${tx("members.you")}` : ""}
                        </strong>
                        <small>
                          {tx("members.no")} <bdi dir="ltr">{m.memberNo}</bdi>
                          {m.familyName ? ` — ${m.familyName}` : ""}
                        </small>
                      </span>
                      <span className="family-row-tags">
                        <span
                          className="family-row-state"
                          data-key={m.role === "admin" ? "trusted" : "active"}
                        >
                          {accountType(m, tx)}
                        </span>
                        {m.suspended && (
                          <span
                            className="family-row-state"
                            data-key="suspended"
                          >
                            {tx("members.suspendedTag")}
                          </span>
                        )}
                      </span>
                      <details className="family-row-menu">
                        <summary
                          aria-label={tx("members.menu", { name: m.name })}
                        >
                          ⋮
                        </summary>
                        <div className="family-row-menu-list">
                          <button
                            type="button"
                            onClick={(e) => {
                              close(e);
                              setConfirm("");
                              setOpen(
                                shown === "details"
                                  ? undefined
                                  : { id: m.id, mode: "details" },
                              );
                            }}
                          >
                            {tx("members.details")}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              close(e);
                              setConfirm("");
                              setOpen(
                                shown === "edit"
                                  ? undefined
                                  : { id: m.id, mode: "edit" },
                              );
                            }}
                          >
                            {tx("members.edit")}
                          </button>
                          {!self && (
                            <button
                              type="button"
                              data-danger={!m.suspended || undefined}
                              onClick={(e) => {
                                close(e);
                                setOpen(undefined);
                                setConfirm(m.id);
                              }}
                            >
                              {m.suspended
                                ? tx("members.unsuspend")
                                : tx("members.suspend")}
                            </button>
                          )}
                        </div>
                      </details>
                    </div>
                    {confirm === m.id && (
                      <div
                        className="family-row-confirm"
                        role="alertdialog"
                        aria-label={
                          m.suspended
                            ? tx("members.unsuspend")
                            : tx("members.suspend")
                        }
                      >
                        <p>
                          {tx(
                            m.suspended
                              ? "members.confirm.unsuspend"
                              : "members.confirm.suspend",
                            { name: m.name },
                          )}
                        </p>
                        <div className="family-row-confirm-actions">
                          <button
                            type="button"
                            className={m.suspended ? s.button : s.danger}
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await update(
                                  {
                                    action: m.suspended
                                      ? "unsuspend"
                                      : "suspend",
                                    id: m.id,
                                  },
                                  m.suspended
                                    ? `تم تفعيل ${m.name}.`
                                    : `تم إيقاف ${m.name}.`,
                                )
                              )
                                setConfirm("");
                            }}
                          >
                            {tx("familyList.yes")}
                          </button>
                          <button
                            type="button"
                            className={s.buttonSecondary}
                            onClick={() => setConfirm("")}
                          >
                            {tx("familyList.no")}
                          </button>
                        </div>
                      </div>
                    )}
                    {shown === "details" && (
                      <dl className="member-details">
                        <dt>{tx("members.d.phone")}</dt>
                        <dd>
                          <bdi dir="ltr">{m.phone}</bdi>
                        </dd>
                        <dt>{tx("members.d.type")}</dt>
                        <dd>{accountType(m, tx)}</dd>
                        {m.familyName && (
                          <>
                            <dt>{tx("members.d.family")}</dt>
                            <dd>{m.familyName}</dd>
                          </>
                        )}
                        <dt>{tx("members.d.access")}</dt>
                        <dd>{accessLabel(m)}</dd>
                        <dt>{tx("members.d.status")}</dt>
                        <dd>
                          {m.suspended
                            ? tx("members.suspendedTag")
                            : tx("members.activeTag")}
                        </dd>
                        {approvalKey(m) && (
                          <>
                            <dt>{tx("members.d.approval")}</dt>
                            <dd>{tx(approvalKey(m)!)}</dd>
                          </>
                        )}
                        {m.createdAt && (
                          <>
                            <dt>{tx("members.d.joined")}</dt>
                            <dd>{day(m.createdAt)}</dd>
                          </>
                        )}
                      </dl>
                    )}
                    {shown === "edit" && (
                      <>
                        {self ? (
                          <p className={s.muted}>
                            لا يمكنك تعديل صلاحيات حسابك أو إيقافه من هنا.
                          </p>
                        ) : (
                          <MemberEditor
                            key={m.id + m.role + m.permissions.join()}
                            member={m}
                            busy={busy}
                            onSave={update}
                          />
                        )}
                        <MemberNumber
                          key={`no-${m.id}-${m.memberNo}`}
                          member={m}
                          busy={busy}
                          onSave={update}
                        />
                        <MemberContact
                          key={`ct-${m.id}-${m.phone}-${m.role}-${m.familyStatus}`}
                          member={m}
                          busy={busy}
                          onSave={update}
                        />
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AddMember({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (body: { name: string; phone: string } & Access) => void;
}) {
  const [access, setAccess] = useState<Access>({
    fullAdmin: false,
    permissions: [],
  });
  return (
    <form
      className={`${s.card} ${s.form}`}
      aria-label="إضافة عضو"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onAdd({
          name: String(f.get("name") ?? ""),
          phone: String(f.get("phone") ?? ""),
          ...access,
        });
      }}
    >
      <div className={s.grid}>
        <label className={s.field}>
          اسم العضو
          <input name="name" required minLength={2} maxLength={120} />
        </label>
        <label className={s.field}>
          رقم الجوال
          <input
            name="phone"
            type="tel"
            dir="ltr"
            required
            placeholder="05xxxxxxxx"
          />
        </label>
      </div>
      <AccessFields initial={access} producer={false} onChange={setAccess} />
      <p className={s.muted}>
        يدخل العضو لاحقًا بـ«نسيت كلمة المرور» برمز يصل جواله ليعيّن كلمة مروره.
      </p>
      <button className={s.button} disabled={busy}>
        إضافة العضو
      </button>
    </form>
  );
}

function MemberEditor({
  member: m,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [access, setAccess] = useState<Access>({
    fullAdmin: m.role === "admin",
    permissions: m.permissions,
  });
  return (
    <div className={s.form}>
      <AccessFields
        initial={access}
        producer={m.role === "producer"}
        onChange={setAccess}
      />
      <button
        type="button"
        className={s.button}
        disabled={busy}
        onClick={() =>
          onSave(
            { action: "access", id: m.id, ...access },
            `تم حفظ صلاحيات ${m.name}.`,
          )
        }
      >
        حفظ الصلاحيات
      </button>
      {m.role !== "admin" && m.permissions.length === 0 && (
        <MemberPassword member={m} busy={busy} onSave={onSave} />
      )}
    </div>
  );
}

/**
 * قرار المالك 2026-11-26: المدير يعدّل جوال العضو، ونوع حسابه: عميل أو أسرة منتجة.
 * الأسرة إلى عميل: تُخفى صفحتها ومنتجاتها محفوظةً، وتعود كما كانت عند إرجاعها أسرة.
 */
function MemberContact({
  member: m,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const { tx, txb } = useTx();
  const [phone, setPhone] = useState(m.phone);
  const family = Boolean(m.familyStatus) && m.familyStatus !== "closed";
  const [type, setType] = useState<"customer" | "family">(
    family ? "family" : "customer",
  );
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={s.form}>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            { action: "phone", id: m.id, phone },
            tx("members.phoneSaved", { name: m.name }),
          );
        }}
      >
        <label className={s.field}>
          {txb("members.phone")}
          <input
            type="tel"
            dir="ltr"
            inputMode="tel"
            value={phone}
            maxLength={20}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <button
          className={s.buttonSecondary}
          disabled={busy || phone.trim() === m.phone}
        >
          {txb("members.phoneSave")}
        </button>
      </form>
      {m.role !== "courier" && (
        <fieldset className={s.ftChoices} disabled={busy}>
          <legend>{txb("members.type")}</legend>
          <div className={s.ftChips}>
            {(["customer", "family"] as const).map((t) => (
              <label key={t} className={s.ftChip}>
                <input
                  type="radio"
                  name={`type-${m.id}`}
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {txb(
                  t === "customer"
                    ? "members.typeCustomer"
                    : "members.typeFamily",
                )}
              </label>
            ))}
          </div>
          <small className={s.muted}>{tx("members.typeHint")}</small>
          {!confirming ? (
            <button
              type="button"
              className={s.buttonSecondary}
              disabled={busy || type === (family ? "family" : "customer")}
              onClick={() => setConfirming(true)}
            >
              {txb("members.typeSave")}
            </button>
          ) : (
            <TypedConfirm
              word={tx("members.confirmWord")}
              prompt={tx("members.typeToConfirm", {
                word: tx("members.confirmWord"),
                name: m.name,
              })}
              confirmLabel={txb("members.typeSave")}
              cancelLabel={txb("asCustomer.cancel")}
              busy={busy}
              onCancel={() => setConfirming(false)}
              onConfirm={async () => {
                if (
                  await onSave(
                    { action: "type", id: m.id, type },
                    tx("members.typeSaved", { name: m.name }),
                  )
                )
                  setConfirming(false);
              }}
            />
          )}
        </fieldset>
      )}
    </div>
  );
}

/** تعيين كلمة مرور لعضو عادي (مثل حساب مراجع المتجر). حسابات الإدارة بالرمز فقط. */
function MemberPassword({
  member: m,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  return (
    <form
      className={s.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await onSave(
            { action: "password", id: m.id, password },
            `تم تعيين كلمة مرور ${m.name}، وخرج من أجهزته.`,
          )
        )
          setPassword("");
      }}
    >
      <PasswordField
        label={`تعيين كلمة مرور جديدة لـ${m.name}`}
        autoComplete="new-password"
        minLength={4}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="أربع خانات على الأقل. يدخل العضو بعدها برقم جواله وكلمة المرور دون رمز، ويخرج من أجهزته الحالية."
      />
      <button
        className={s.buttonSecondary}
        disabled={busy || password.length < 4}
      >
        حفظ كلمة المرور
      </button>
    </form>
  );
}

/**
 * تغيير رقم العضو لرقم مميز متاح (مثل 241 ← 22). المحجوز عن التسجيل مسموح للإدارة.
 * الرقم القديم يبقى لصاحبه (روابط دعوته القديمة تعمل) ولا يُعطى لغيره.
 */
function MemberNumber({
  member: m,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<boolean>;
}) {
  const [no, setNo] = useState(String(m.memberNo));
  const clean = no.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          { action: "number", id: m.id, memberNo: clean },
          `صار رقم ${m.name}: ${clean}.`,
        );
      }}
    >
      <label className={s.field}>
        رقم العضو (يظهر فوق اسمه)
        <input
          value={no}
          onChange={(e) => setNo(e.target.value)}
          dir="ltr"
          inputMode="numeric"
          maxLength={7}
          required
        />
        <small className={s.muted}>
          اكتب رقمًا متاحًا. الأرقام المتشابهة (11، 222…) و2030 محجوزة عن
          التسجيل وتمنحها الإدارة فقط. الرقم الحالي {m.memberNo} يبقى له ولا
          يُعطى لغيره.
        </small>
      </label>
      <button
        className={s.buttonSecondary}
        disabled={
          busy || !/^\d{1,7}$/.test(clean) || clean === String(m.memberNo)
        }
      >
        حفظ الرقم
      </button>
    </form>
  );
}
