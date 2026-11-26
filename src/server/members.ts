import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError, normalizePhone } from "./security";
import { auditAccountType, setAccountType } from "./account-type";
import { adminPermissions } from "../lib/permissions";
import { hashPassword } from "./credentials";

export type Member = {
  id: string;
  name: string;
  phone: string;
  role: SessionUser["role"];
  /** رقم العضو المعروض فوق اسمه. */
  memberNo: number;
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
      `SELECT u.id,u.name,u.phone,u.role,u.member_no AS "memberNo",u.permissions,(u.suspended_at IS NOT NULL) AS suspended,
        COALESCE(p.trade_name,p.name) AS "familyName",p.status AS "familyStatus",u.created_at AS "createdAt"
       FROM jdatna.users u LEFT JOIN jdatna.producer_profiles p ON p.user_id=u.id
       WHERE $1='' OR u.name ILIKE '%'||$1||'%' OR COALESCE(p.name,'') ILIKE '%'||$1||'%'
         OR ($2<>'' AND u.phone LIKE '%'||$2||'%')
         OR u.member_no=$3::int
       ORDER BY (u.role='admin' OR cardinality(u.permissions)>0) DESC,u.created_at DESC LIMIT 200`,
      [
        q,
        digits.length >= 3 ? digits : "",
        // رقم العضو (ولو من رقمين مثل 22): مطابقة تامة.
        /^[0-9٠-٩]{1,7}$/.test(q)
          ? Number(q.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))))
          : null,
      ],
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
  /** مدير عام (كل الأقسام وإدارة الأعضاء). لا يُعطى لحساب أسرة منتجة. */
  fullAdmin: z.boolean().default(false),
  /** مدير مخصص: أقسام محددة لأي عضو، عميلًا كان أو أسرة منتجة. */
  permissions: z.array(permission).max(40).default([]),
};
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("unsuspend"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("access"), id: z.uuid(), ...access }).strict(),
  /** تغيير رقم العضو لرقم مميز متاح (مثل 241 ← 22)، ولو كان من المحجوز عن التسجيل. */
  z
    .object({
      action: z.literal("number"),
      id: z.uuid(),
      memberNo: z.coerce
        .number({ error: "اكتب الرقم" })
        .int("الرقم بلا كسور")
        .min(1, "الرقم من 1")
        .max(9999999, "الرقم سبع خانات على الأكثر"),
    })
    .strict(),
  /** المدير يعيّن كلمة مرور لعضو عادي (مثل حساب مراجع المتجر). */
  z
    .object({
      action: z.literal("password"),
      id: z.uuid(),
      password: z
        .string()
        // قرار المالك 2026-11-26: أربع خانات حدًّا أدنى، بأي أحرف أو أرقام أو رموز.
        .min(4, "كلمة المرور أربع خانات على الأقل")
        .max(128, "كلمة المرور طويلة جدًا"),
    })
    .strict(),
  /** قرار المالك 2026-11-26: تعديل جوال العضو (يدخل به بعدها)، ونوع حسابه عميل أو أسرة منتجة. */
  z
    .object({
      action: z.literal("phone"),
      id: z.uuid(),
      phone: z.string().trim().min(9, "اكتب رقم الجوال").max(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("type"),
      id: z.uuid(),
      type: z.enum(["customer", "family"]),
    })
    .strict(),
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
  if (value.action === "number") return changeMemberNo(user, value);
  if (value.action === "phone") return changeMemberPhone(user, value);
  if (value.action === "type")
    return transaction(async (client) => {
      const r = await setAccountType(client, value.id, value.type);
      if (r.register)
        throw new HttpError(
          400,
          "لا ملف أسرة لهذا العضو بعد؛ يسجّل أسرته من «معلوماتي» ← «سجّل أسرتك»",
        );
      await auditAccountType(client, user.id, value.id, value.type);
      return { id: value.id, type: value.type };
    });
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
    if (value.action === "password") {
      // حسابات الإدارة (مدير أو صلاحيات محددة) تعيّن كلمة مرورها بنفسها برمز جوالها فقط.
      if (target.role === "admin" || (target.permissions ?? []).length > 0)
        throw new HttpError(
          403,
          "حساب إداري: يعيّن كلمة مروره بنفسه من «نسيت كلمة المرور» برمز جواله",
        );
      await client.query(
        "UPDATE jdatna.users SET password_hash=$2 WHERE id=$1",
        [value.id, await hashPassword(value.password)],
      );
      // كلمة المرور الجديدة تُخرج العضو من كل أجهزته.
      await client.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [
        value.id,
      ]);
      // لا تُحفظ كلمة المرور في السجل.
      await audit(client, user, "member.password", value.id, {
        action: "password",
      });
      return { ok: true };
    }
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
 * الإدارة تغيّر رقم العضو لرقم متاح: غير مستعمل، وليس رقمًا قديمًا لعضو آخر.
 * الرقم القديم يبقى لصاحبه في السجل (روابط دعوته القديمة تصل إليه) ولا يُعطى لغيره.
 * المحجوز عن التسجيل (11، 222، 2030…) مسموح هنا لأن الإدارة هي من تمنحه.
 */
async function changeMemberNo(
  user: SessionUser,
  value: { id: string; memberNo: number },
) {
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('jdatna.member_no'))",
    );
    const target = (
      await client.query<{ member_no: number }>(
        "SELECT member_no FROM jdatna.users WHERE id=$1 FOR UPDATE",
        [value.id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, "العضو غير موجود");
    if (target.member_no === value.memberNo)
      return { ok: true, memberNo: value.memberNo };
    const taken = (
      await client.query(
        `SELECT 1 FROM jdatna.users WHERE member_no=$1 AND id<>$2
         UNION ALL SELECT 1 FROM jdatna.member_no_history WHERE member_no=$1 AND user_id<>$2`,
        [value.memberNo, value.id],
      )
    ).rowCount;
    if (taken)
      throw new HttpError(
        409,
        `الرقم ${value.memberNo} غير متاح، اختر رقمًا آخر`,
        {
          field: "memberNo",
        },
      );
    // إن رجع لرقم قديم له: يخرج من السجل ليكون رقمه الحالي.
    await client.query(
      "DELETE FROM jdatna.member_no_history WHERE member_no=$1 AND user_id=$2",
      [value.memberNo, value.id],
    );
    await client.query(
      "INSERT INTO jdatna.member_no_history(member_no,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [target.member_no, value.id],
    );
    await client.query("UPDATE jdatna.users SET member_no=$2 WHERE id=$1", [
      value.id,
      value.memberNo,
    ]);
    await audit(client, user, "member.number", value.id, {
      from: target.member_no,
      to: value.memberNo,
    });
    return { ok: true, memberNo: value.memberNo };
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

/** تعديل جوال العضو (قرار المالك 2026-11-26): لا يتكرر لعضوين، ويتبعه جوال ملف أسرته. */
async function changeMemberPhone(
  user: SessionUser,
  value: { id: string; phone: string },
) {
  const phone = normalizePhone(value.phone);
  return transaction(async (client) => {
    const target = (
      await client.query<{ phone: string }>(
        "SELECT phone FROM jdatna.users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [value.id],
      )
    ).rows[0];
    if (!target) throw new HttpError(404, "العضو غير موجود");
    if (target.phone === phone) return { id: value.id, phone };
    const taken = (
      await client.query(
        "SELECT 1 FROM jdatna.users WHERE phone=$1 AND id<>$2",
        [phone, value.id],
      )
    ).rowCount;
    if (taken) throw new HttpError(409, "هذا الجوال مسجّل لعضو آخر");
    await client.query(
      "UPDATE jdatna.users SET phone=$2,phone_verified_at=now() WHERE id=$1",
      [value.id, phone],
    );
    await client.query(
      "UPDATE jdatna.producer_profiles SET phone=$2,updated_at=now() WHERE user_id=$1",
      [value.id, phone],
    );
    await audit(client, user, "member.phone", value.id, {
      from: target.phone,
      to: phone,
    });
    return { id: value.id, phone };
  });
}
