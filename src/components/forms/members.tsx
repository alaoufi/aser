"use client";
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
const roleLabels: Record<Member["role"], string> = {
  customer: "عميل",
  producer: "أسرة منتجة",
  staff: "مشرف",
  admin: "مدير",
};

/** الأعضاء والصلاحيات: بحث، إيقاف وتفعيل، ومشرفون بصلاحيات محددة. للمدير فقط. */
export function MembersAdmin() {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load(q = query) {
    setMembers(
      (
        await api<{ members: Member[] }>(
          `/api/admin/members?q=${encodeURIComponent(q)}`,
        )
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>الأعضاء والصلاحيات</h2>
      <p className={s.muted}>
        المدير يملك كل الصلاحيات. المشرف يرى أقسام الإدارة المسموحة له فقط،
        ويدخل بكلمة المرور ثم رمز الجوال. الإيقاف يُخرج العضو من أجهزته فورًا
        ويمنع دخوله.
      </p>
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
                    {roleLabels[m.role]}
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

function MemberEditor({
  member: m,
  busy,
  onSave,
}: {
  member: Member;
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: string) => Promise<void>;
}) {
  const [role, setRole] = useState<"customer" | "staff" | "admin">(
    m.role === "producer" ? "customer" : m.role,
  );
  const [permissions, setPermissions] = useState<string[]>(m.permissions);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={s.form}>
      {m.role === "producer" ? (
        <p className={s.muted}>
          حساب أسرة منتجة: دوره يُدار من مراجعة الأسر. يمكنك إيقافه أو تفعيله.
        </p>
      ) : (
        <>
          <label className={s.field}>
            الدور
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="customer">عميل</option>
              <option value="staff">مشرف بصلاحيات محددة</option>
              <option value="admin">مدير (كل الصلاحيات)</option>
            </select>
          </label>
          {role === "staff" && (
            <fieldset>
              <legend>صلاحيات المشرف</legend>
              <div className={s.checks}>
                {(
                  Object.entries(adminPermissions) as [
                    AdminPermission,
                    string,
                  ][]
                ).map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(id)}
                      onChange={(e) =>
                        setPermissions((p) =>
                          e.target.checked
                            ? [...p, id]
                            : p.filter((x) => x !== id),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={() =>
              onSave(
                { action: "role", id: m.id, role, permissions },
                `تم حفظ صلاحيات ${m.name}.`,
              )
            }
          >
            حفظ الصلاحيات
          </button>
        </>
      )}
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
