import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError, normalizePhone } from "./security";
import { adminPermissions } from "../lib/permissions";

export type Member = {
  id: string;
  name: string;
  phone: string;
  role: SessionUser["role"];
  permissions: string[];
  suspended: boolean;
  familyName: string | null;
  createdAt: string;
};

/** إدارة الأعضاء والصلاحيات للمدير الكامل فقط، حتى لا يرفع أحد صلاحياته بنفسه. */
function assertOwnerAdmin(user: SessionUser) {
  if (user.role !== "admin")
    throw new HttpError(403, "إدارة الأعضاء للمدير فقط");
}

export async function listMembers(
  user: SessionUser,
  query = "",
): Promise<Member[]> {
  assertOwnerAdmin(user);
  const q = query.trim().slice(0, 80);
  const digits = q.replace(/\D/g, "");
  return (
    await db().query(
      `SELECT u.id,u.name,u.phone,u.role,u.permissions,(u.suspended_at IS NOT NULL) AS suspended,
        COALESCE(p.trade_name,p.name) AS "familyName",u.created_at AS "createdAt"
       FROM jdatna.users u LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id
       WHERE $1='' OR u.name ILIKE '%'||$1||'%' OR COALESCE(p.name,'') ILIKE '%'||$1||'%'
         OR ($2<>'' AND u.phone LIKE '%'||$2||'%')
       ORDER BY (u.role='admin' OR cardinality(u.permissions)>0) DESC,u.created_at DESC LIMIT 200`,
      [q, digits.length >= 3 ? digits : ""],
    )
  ).rows;
}

const permission = z.enum(
  Object.keys(adminPermissions) as [
    keyof typeof adminPermissions,
    ...(keyof typeof adminPermissions)[],
  ],
);
const access = {
  /** مدير كامل (كل الصلاحيات وإدارة الأعضاء). لا يُعطى لحساب أسرة منتجة. */
  fullAdmin: z.boolean().default(false),
  /** صلاحيات إدارية محددة لأي عضو، عميلًا كان أو أسرة منتجة. */
  permissions: z.array(permission).max(20).default([]),
};
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("unsuspend"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("access"), id: z.uuid(), ...access }).strict(),
  z
    .object({
      action: z.literal("create"),
      name: z.string().trim().min(2, "اكتب اسم العضو").max(120),
      phone: z.string().trim().min(9).max(20),
      ...access,
    })
    .strict(),
]);

async function audit(
  client: PoolClient,
  user: SessionUser,
  action: string,
  target: string,
  details: unknown,
) {
  await client.query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), user.id, action, target, JSON.stringify(details)],
  );
}

/** يحسب الدور والصلاحيات المخزنة من طلب الصلاحيات، مع إبقاء نوع الحساب. */
function accessFor(
  currentRole: string,
  fullAdmin: boolean,
  permissions: string[],
) {
  if (fullAdmin) {
    if (currentRole === "producer")
      throw new HttpError(
        400,
        "حساب الأسرة المنتجة يُعطى صلاحيات محددة، لا مديرًا كاملًا",
      );
    return { role: "admin", permissions: [] as string[] };
  }
  return {
    role:
      currentRole === "admin" || currentRole === "staff"
        ? "customer"
        : currentRole,
    permissions: [...new Set(permissions)],
  };
}

export async function updateMember(user: SessionUser, input: unknown) {
  assertOwnerAdmin(user);
  const value = updateSchema.parse(input);
  if (value.action === "create") return createMember(user, value);
  if (value.id === user.id)
    throw new HttpError(400, "لا يمكنك تعديل حسابك أنت من هنا");
  return transaction(async (client) => {
    // قفل حتى لا يُوقف أو يُنزَل آخر مدير في طلبين متزامنين.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.members.admins'))",
    );
    const target = (
      await client.query(
        "SELECT id,role,suspended_at,permissions FROM jdatna.users WHERE id=$1 FOR UPDATE",
        [value.id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, "العضو غير موجود");
    const activeAdmins = Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM jdatna.users WHERE role='admin' AND suspended_at IS NULL",
        )
      ).rows[0].n,
    );
    const losesAdmin =
      target.role === "admin" &&
      !target.suspended_at &&
      (value.action === "suspend" ||
        (value.action === "access" && !value.fullAdmin));
    if (losesAdmin && activeAdmins <= 1)
      throw new HttpError(409, "لا يمكن إيقاف أو إنزال آخر مدير نشط");
    if (value.action === "suspend") {
      await client.query(
        "UPDATE jdatna.users SET suspended_at=now() WHERE id=$1",
        [value.id],
      );
      // الإيقاف يُخرج العضو من كل أجهزته فورًا.
      await client.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [
        value.id,
      ]);
    } else if (value.action === "unsuspend") {
      await client.query(
        "UPDATE jdatna.users SET suspended_at=NULL WHERE id=$1",
        [value.id],
      );
    } else {
      const next = accessFor(target.role, value.fullAdmin, value.permissions);
      await client.query(
        "UPDATE jdatna.users SET role=$2,permissions=$3 WHERE id=$1",
        [value.id, next.role, next.permissions],
      );
      // تغيير الصلاحيات يتطلب دخولًا جديدًا (ولخطوة رمز الجوال للإدارة).
      const changed =
        next.role !== target.role ||
        [...next.permissions].sort().join() !==
          [...(target.permissions ?? [])].sort().join();
      if (changed)
        await client.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [
          value.id,
        ]);
    }
    await audit(client, user, "member." + value.action, value.id, value);
    return { ok: true };
  });
}

/**
 * إضافة عضو جديد برقم جواله (يعتمده المدير)، مع صلاحياته. يدخل لاحقًا
 * بـ«نسيت كلمة المرور» برمز يصل جواله ليعيّن كلمة مروره.
 */
async function createMember(
  user: SessionUser,
  value: {
    name: string;
    phone: string;
    fullAdmin: boolean;
    permissions: string[];
  },
) {
  let phone: string;
  try {
    phone = normalizePhone(value.phone);
  } catch {
    throw new HttpError(400, "رقم الجوال غير صحيح");
  }
  return transaction(async (client) => {
    const exists = (
      await client.query("SELECT id FROM jdatna.users WHERE phone=$1", [phone])
    ).rows[0];
    if (exists)
      throw new HttpError(
        409,
        "هذا الجوال مسجل؛ ابحث عنه في القائمة وعدّل صلاحياته",
      );
    const next = accessFor("customer", value.fullAdmin, value.permissions);
    const id = randomUUID();
    await client.query(
      "INSERT INTO jdatna.users(id,phone,name,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
      [id, phone, value.name, next.role, next.permissions],
    );
    await audit(client, user, "member.create", id, { ...value, phone });
    return { ok: true, id };
  });
}
