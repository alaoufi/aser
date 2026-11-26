"use client";
import { PasswordField } from "./password-field";
import { adminCache, fetchAdmin } from "./admin-cache";
import { useEffect, useState } from "react";
import { adminPermissions, type AdminPermission } from "@/lib/permissions";
import { NAV_GROUPS } from "@/lib/admin-nav";
import { Message, api, s, useSession } from "./shared";

type Member = {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "producer" | "admin" | "staff";
  memberNo: number;
  permissions: string[];
  suspended: boolean;
  familyName: string | null;
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
  return (
    <section>
      <h2>الأعضاء والصلاحيات</h2>
      <p className={s.muted}>
        أي عضو (عميل أو أسرة منتجة) يمكن منحه صلاحيات إدارية دون أن يتغير حسابه
        الشخصي؛ فيظهر له في قائمة حسابه «لوحة الإدارة»، وتفتح بضغطة أقسامه
        المسموحة فقط، بجلسة مستقلة 12 ساعة. والإيقاف يُخرج العضو فورًا.
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
                    <span className="member-no">
                      رقم العضو <b dir="ltr">{m.memberNo}</b>
                    </span>
                    <br />
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
                {openId === m.id && (
                  <MemberNumber
                    key={`no-${m.id}-${m.memberNo}`}
                    member={m}
                    busy={busy}
                    onSave={update}
                  />
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
      {m.role !== "admin" && m.permissions.length === 0 && (
        <MemberPassword member={m} busy={busy} onSave={onSave} />
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
