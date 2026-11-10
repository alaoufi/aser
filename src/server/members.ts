import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
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

/** إدارة الأعضاء والصلاحيات للمدير الكامل فقط، حتى لا يرفع مشرف صلاحياته. */
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
       ORDER BY (u.role IN ('admin','staff')) DESC,u.created_at DESC LIMIT 200`,
      [q, digits.length >= 3 ? digits : ""],
    )
  ).rows;
}

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("unsuspend"), id: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("role"),
      id: z.uuid(),
      role: z.enum(["customer", "staff", "admin"]),
      permissions: z
        .array(
          z.enum(
            Object.keys(adminPermissions) as [
              keyof typeof adminPermissions,
              ...(keyof typeof adminPermissions)[],
            ],
          ),
        )
        .max(20)
        .default([]),
    })
    .strict(),
]);

export async function updateMember(user: SessionUser, input: unknown) {
  assertOwnerAdmin(user);
  const value = updateSchema.parse(input);
  if (value.id === user.id)
    throw new HttpError(400, "لا يمكنك تعديل حسابك أنت من هنا");
  return transaction(async (client) => {
    // قفل الحسابات الإدارية لمنع إيقاف/إنزال آخر مدير في طلبين متزامنين.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.members.admins'))",
    );
    const target = (
      await client.query(
        "SELECT id,role,suspended_at FROM jdatna.users WHERE id=$1 FOR UPDATE",
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
        (value.action === "role" && value.role !== "admin"));
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
      // دور الأسرة المنتجة مرتبط بملفها؛ لا يُغيَّر من هنا.
      if (target.role === "producer")
        throw new HttpError(
          400,
          "حساب الأسرة المنتجة يُدار من مراجعة الأسر، لا من الصلاحيات",
        );
      await client.query(
        "UPDATE jdatna.users SET role=$2,permissions=$3 WHERE id=$1",
        [
          value.id,
          value.role,
          value.role === "staff" ? [...new Set(value.permissions)] : [],
        ],
      );
      // تغيير الدور يتطلب دخولًا جديدًا (ولخطوة الجوال للإدارة).
      if (value.role !== target.role)
        await client.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [
          value.id,
        ]);
    }
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        user.id,
        "member." + value.action,
        value.id,
        JSON.stringify(value),
      ],
    );
    return { ok: true };
  });
}
