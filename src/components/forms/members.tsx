"use client";
import { adminCache, fetchAdmin } from "./admin-cache";
import { useEffect, useState } from "react";
import { adminPermissions, type AdminPermission } from "@/lib/permissions";
import { Message, api, s, useSession } from "./shared";

type Member = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "producer" | "admin" | "staff";
  permissions: string[];
  suspended: boolean;
  familyName: string | null;
};
type Access = { fullAdmin: boolean; permissions: string[] };

function accessLabel(m: Member) {
  const type = m.role === "producer" ? "أسرة منتجة" : "عضو";
  if (m.role === "admin") return "مدير كامل";
  return m.permissions.length
    ? `${type} · صلاحيات إدارية (${m.permissions.length})`
    : type;
}

/** نوع الصلاحية: عضو عادي، أو صلاحيات محددة، أو مدير كامل (لغير الأسر). */
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
            ["limited", "صلاحيات إدارية محددة"],
            ["full", "مدير كامل (كل الصلاحيات)"],
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
        <small>حساب الأسرة المنتجة يُعطى صلاحيات محددة ويبقى حساب أسرة.</small>
      )}
      {mode === "limited" && (
        <div className={s.checks}>
          {(
            Object.entries(adminPermissions) as [AdminPermission, string][]
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={perms.includes(id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...perms, id]
                    : perms.filter((x) => x !== id);
                  setPerms(next);
                  emit("limited", next);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** قائمة الأعضاء بلا بحث؛ تُحفظ وتُحمَّل مسبقًا كبقية أقسام الإدارة. */
export const MEMBERS_URL = "/api/admin/members?q=";
/** الأعضاء والصلاحيات (للمدير): إضافة عضو، صلاحيات إدارية لأي عضو، وإيقاف. */
export function MembersAdmin() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[] | null>(
    () =>
      (adminCache.get(MEMBERS_URL) as { members: Member[] } | undefined)
        ?.members ?? null,
  );
  const [openId, setOpenId] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load(q = query) {
    setMembers(
      (
        await (q
          ? api<{ members: Member[] }>(
              `/api/admin/members?q=${encodeURIComponent(q)}`,
            )
          : fetchAdmin<{ members: Member[] }>(MEMBERS_URL))
      ).members,
    );
  }
  useEffect(() => {
    load("").catch((e) => setError((e as Error).message));
  }, []);
  async function update(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/api/admin/members", {
        method: "PATCH",
        body: JSON.stringify(body),
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
  return (
    <section>
      <h2>الأعضاء والصلاحيات</h2>
      <p className={s.muted}>
        أي عضو (عميل أو أسرة منتجة) يمكن منحه صلاحيات إدارية دون أن يتغير حسابه
        الخاص؛ فيظهر له «حسابي الخاص» و«حساب الإدارة» الذي يفتح أقسامه المسموحة
        فقط. حساب الإدارة يدخل بكلمة المرور ثم رمز الجوال، والإيقاف يُخرج العضو
        فورًا.
      </p>
      <button
        type="button"
        className={s.button}
        aria-expanded={adding}
        onClick={() => setAdding((v) => !v)}
      >
        ＋ إضافة عضو أو مشرف
      </button>
      {adding && (
        <AddMember
          busy={busy}
          onAdd={async (body) => {
            if (
              await update(
                { action: "create", ...body },
                `تمت إضافة ${body.name}.`,
              )
            )
              setAdding(false);
          }}
        />
      )}
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
            placeholder="الاسم أو رقم الجوال"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className={s.button}>بحث</button>
      </form>
      <Message error={error} success={success} />
      {members === null ? (
        <p role="status">جارٍ تحميل الأعضاء…</p>
      ) : members.length === 0 ? (
        <p className={s.notice}>لا يوجد أعضاء مطابقون.</p>
      ) : (
        <div className={`${s.card} ${s.categoryList}`}>
          {members.map((m) => {
            const self = m.id === session.user?.id;
            return (
              <div key={m.id} className={s.categoryItem}>
                <button
                  type="button"
                  className={s.categoryRow}
                  aria-expanded={openId === m.id}
                  onClick={() => setOpenId((v) => (v === m.id ? "" : m.id))}
                >
                  <span>
                    {m.name}
                    {m.familyName ? ` — ${m.familyName}` : ""}
                    {self ? " (حسابك)" : ""}
                  </span>
                  <small>
                    {accessLabel(m)}
                    {m.suspended ? " · موقوف" : ""}{" "}
                    <bdi dir="ltr">{m.phone}</bdi>
                  </small>
                </button>
                {openId === m.id && !self && (
                  <MemberEditor
                    key={m.id + m.role + m.permissions.join()}
                    member={m}
                    busy={busy}
                    onSave={update}
                  />
                )}
                {openId === m.id && self && (
                  <p className={s.muted}>
                    لا يمكنك تعديل صلاحيات حسابك أو إيقافه من هنا.
                  </p>
                )}
              </div>
            );
          })}
        </div>
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
  const [confirming, setConfirming] = useState(false);
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
      <div className={s.actions}>
        {m.suspended ? (
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={() =>
              onSave({ action: "unsuspend", id: m.id }, `تم تفعيل ${m.name}.`)
            }
          >
            تفعيل الحساب
          </button>
        ) : !confirming ? (
          <button
            type="button"
            className={s.danger}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            إيقاف الحساب
          </button>
        ) : (
          <>
            <button
              type="button"
              className={s.danger}
              disabled={busy}
              onClick={() =>
                onSave({ action: "suspend", id: m.id }, `تم إيقاف ${m.name}.`)
              }
            >
              تأكيد إيقاف {m.name}
            </button>
            <button
              type="button"
              className={s.buttonSecondary}
              onClick={() => setConfirming(false)}
            >
              تراجع
            </button>
          </>
        )}
      </div>
    </div>
  );
}
