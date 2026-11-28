import { randomUUID } from "node:crypto";
import type { SessionUser } from "../lib/types";
import {
  cleanMenuLayout,
  cleanMenuOrder,
  type MenuLayout,
  type MenuOrder,
} from "../lib/admin-nav";
import { can, isManager } from "../lib/permissions";
import { databaseConfigured, db, transaction } from "./db";
import { HttpError } from "./security";

/**
 * «ترتيب القوائم» (من «أي خدمة»، AYK-410): ترتيب قائمة الإدارة الذي يحفظه المدير الكامل.
 * في إعدادات الموقع، ويُطبَّق فورًا على قائمة كل أعضاء الإدارة بلا نشر.
 */
const KEY = "admin:menu-layout";

export async function getMenuLayout(
  user: SessionUser,
): Promise<MenuLayout | null> {
  if (!isManager(user)) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  if (!databaseConfigured()) return null;
  const raw = (
    await db().query<{ value: string }>(
      "SELECT value FROM jdatna.site_settings WHERE key=$1",
      [KEY],
    )
  ).rows[0]?.value;
  if (!raw) return null;
  try {
    // ما حُفظ يُفحص من جديد عند القراءة، فلا يصل للقائمة شيء غير مقبول.
    return cleanMenuLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveMenuLayout(user: SessionUser, input: unknown) {
  if (!can(user, "menu-layout"))
    throw new HttpError(403, "ترتيب القوائم لمن أُعطي قسمها في الإدارة");
  const reset = (input as { reset?: unknown } | null)?.reset === true;
  const layout = reset ? null : cleanMenuLayout(input);
  if (!reset && !layout)
    throw new HttpError(400, "الترتيب غير صالح. حدّث الصفحة وحاول مرة أخرى.");
  return transaction(async (client) => {
    if (layout)
      await client.query(
        `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES($1,$2,now(),$3)
         ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
        [KEY, JSON.stringify(layout), user.id],
      );
    else
      await client.query("DELETE FROM jdatna.site_settings WHERE key=$1", [
        KEY,
      ]);
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'admin.menu-layout',NULL,$3)",
      [randomUUID(), user.id, JSON.stringify({ reset })],
    );
    return { layout };
  });
}

/**
 * ترتيب القائمة الجانبية الشخصي لكل مدير (طلب المالك 2026-11-28): بالسحب والإفلات، ويبقى بعد التحديث.
 * لكل عضو إدارة ترتيبه، فوق «ترتيب القوائم» العام. للعرض فقط ولا يغيّر الصلاحيات.
 */
export async function getMenuOrder(
  user: SessionUser,
): Promise<MenuOrder | null> {
  if (!isManager(user)) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  if (!databaseConfigured()) return null;
  const raw = (
    await db().query<{ menu_order: unknown }>(
      "SELECT menu_order FROM jdatna.admin_menu_orders WHERE user_id=$1",
      [user.id],
    )
  ).rows[0]?.menu_order;
  return raw ? cleanMenuOrder(raw) : null;
}

export async function saveMenuOrder(user: SessionUser, input: unknown) {
  if (!isManager(user)) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const reset = (input as { reset?: unknown } | null)?.reset === true;
  const order = reset ? null : cleanMenuOrder(input);
  if (!reset && !order)
    throw new HttpError(400, "الترتيب غير صالح. حدّث الصفحة وحاول مرة أخرى.");
  if (order)
    await db().query(
      `INSERT INTO jdatna.admin_menu_orders(user_id,menu_order,updated_at) VALUES($1,$2,now())
       ON CONFLICT(user_id) DO UPDATE SET menu_order=EXCLUDED.menu_order,updated_at=now()`,
      [user.id, JSON.stringify(order)],
    );
  else
    await db().query("DELETE FROM jdatna.admin_menu_orders WHERE user_id=$1", [
      user.id,
    ]);
  return { order };
}
