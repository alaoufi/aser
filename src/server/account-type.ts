import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../lib/types";
import { transaction } from "./db";
import { HttpError } from "./security";

export type AccountType = "customer" | "family";

/**
 * نوع الحساب (قرار المالك 2026-11-26): عميل أو أسرة منتجة، يغيّره صاحبه من «معلوماتي» أو المدير
 * العام من «الأعضاء».
 * - إلى عميل: يُغلق ملف الأسرة ('closed')، فتُخفى صفحتها ومنتجاتها دون حذف، وتُحفظ حالتها السابقة.
 * - إلى أسرة: يعود الملف المغلق بحالته السابقة كما كان. ومن لا ملف له يسجّل أسرته من «/register».
 * حساب المدير يبقى مديرًا؛ يتغير ملف أسرته فقط. والأسرة الموقوفة لا تُفتح بهذا.
 */
export async function setAccountType(
  client: PoolClient,
  userId: string,
  type: AccountType,
) {
  const target = (
    await client.query<{ role: string }>(
      "SELECT role FROM jdatna.users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [userId],
    )
  ).rows[0];
  if (!target) throw new HttpError(404, "العضو غير موجود");
  if (target.role === "courier")
    throw new HttpError(400, "حساب المندوب لا يتحول من هنا");
  const profile = (
    await client.query<{
      id: string;
      status: string;
      closed_from: string | null;
    }>(
      "SELECT id,status,closed_from FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
      [userId],
    )
  ).rows[0];
  if (type === "customer") {
    if (profile?.status === "suspended")
      throw new HttpError(403, "ملف الأسرة موقوف من الإدارة");
    if (profile && profile.status !== "closed")
      await client.query(
        "UPDATE jdatna.producer_profiles SET closed_from=status,status='closed',updated_at=now() WHERE id=$1",
        [profile.id],
      );
    if (target.role === "producer")
      await client.query(
        "UPDATE jdatna.users SET role='customer' WHERE id=$1",
        [userId],
      );
    return { type, register: false };
  }
  // إلى أسرة منتجة.
  if (!profile) return { type, register: true };
  if (profile.status === "closed")
    await client.query(
      "UPDATE jdatna.producer_profiles SET status=COALESCE(closed_from,'pending'),closed_from=NULL,updated_at=now() WHERE id=$1",
      [profile.id],
    );
  if (target.role === "customer")
    await client.query("UPDATE jdatna.users SET role='producer' WHERE id=$1", [
      userId,
    ]);
  return { type, register: false };
}

/** صاحب الحساب يغيّر نوع حسابه من «معلوماتي». */
export async function changeMyAccountType(user: SessionUser, type: unknown) {
  if (type !== "customer" && type !== "family")
    throw new HttpError(400, "نوع الحساب غير معروف");
  return transaction((client) => setAccountType(client, user.id, type));
}

export async function auditAccountType(
  client: PoolClient,
  actor: string,
  target: string,
  type: AccountType,
) {
  await client.query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'member.account_type',$3,$4)",
    [randomUUID(), actor, target, JSON.stringify({ type })],
  );
}
