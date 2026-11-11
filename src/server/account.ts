import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";

/** العبارة التي يكتبها المستخدم لتأكيد الحذف النهائي. */
export const DELETE_CONFIRMATION = "حذف حسابي";

/**
 * حذف الحساب من داخل التطبيق (شرط آبل وقوقل بلاي): يُحذف الحساب وكل متعلقاته نهائيًا
 * (الطلبات، العروض، المنتجات، التقييمات، بيانات الأسرة ومستنداتها، الإشعارات، الجلسات)،
 * وتبقى المحادثات وحدها كما هي للرجوع إليها عند النزاع.
 */
export async function deleteAccount(user: SessionUser, input: unknown) {
  const { confirm } = z.object({ confirm: z.string() }).strict().parse(input);
  if (confirm.trim() !== DELETE_CONFIRMATION)
    throw new HttpError(400, `اكتب «${DELETE_CONFIRMATION}» لتأكيد الحذف`);
  const objectKeys = await transaction(async (client) => {
    const me = (
      await client.query(
        "SELECT role,deleted_at FROM jdatna.users WHERE id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!me || me.deleted_at) throw new HttpError(404, "الحساب غير موجود");
    if (me.role === "admin") {
      const admins = (
        await client.query(
          "SELECT count(*)::int AS n FROM jdatna.users WHERE role='admin' AND suspended_at IS NULL AND deleted_at IS NULL",
        )
      ).rows[0].n as number;
      if (admins <= 1)
        throw new HttpError(
          409,
          "أنت المدير الوحيد؛ عيّن مديرًا آخر قبل حذف حسابك",
        );
    }

    // كل متعلقات الحساب تُحذف نهائيًا، وتبقى المحادثات كما هي للرجوع إليها عند النزاع.
    const family = (
      await client.query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
        [user.id],
      )
    ).rows[0] as { id: string } | undefined;
    const del = (sql: string, args: unknown[]) => client.query(sql, args);
    // طلباته كعميل، وتقييماته وتقييمات الآخرين له.
    await del("DELETE FROM jdatna.order_requests WHERE user_id=$1", [user.id]);
    await del(
      "DELETE FROM jdatna.ratings WHERE rater_id=$1 OR (kind='member' AND target_id=$1)",
      [user.id],
    );
    if (family) {
      const products = (
        await client.query(
          "SELECT id FROM jdatna.products WHERE producer_id=$1",
          [family.id],
        )
      ).rows.map((r) => r.id as string);
      // طلبات الأسرة وعروضها ومنتجاتها وتقييماتها وشهادتها وكل بياناتها.
      await del("DELETE FROM jdatna.certificates WHERE producer_id=$1", [
        family.id,
      ]);
      await del("DELETE FROM jdatna.order_requests WHERE producer_id=$1", [
        family.id,
      ]);
      await del("DELETE FROM jdatna.offers WHERE producer_id=$1", [family.id]);
      await del(
        "DELETE FROM jdatna.ratings WHERE (kind='family' AND target_id=$1) OR (kind='product' AND target_id=ANY($2::uuid[]))",
        [family.id, products],
      );
      await del("DELETE FROM jdatna.reports WHERE product_id=ANY($1::uuid[])", [
        products,
      ]);
      for (const table of [
        "product_categories",
        "product_allergens",
        "product_media",
      ])
        await del(
          `DELETE FROM jdatna.${table} WHERE product_id=ANY($1::uuid[])`,
          [products],
        );
      await del("DELETE FROM jdatna.products WHERE producer_id=$1", [
        family.id,
      ]);
      for (const table of [
        "producer_verifications",
        "producer_categories",
        "producer_social_links",
        "business_hours",
        "delivery_areas",
        "pickup_locations",
        "producer_coverage",
        "producer_coverage_details",
        "producer_zones",
        "producer_cooking_days",
        "producer_private",
        "photo_library",
      ])
        await del(`DELETE FROM jdatna.${table} WHERE producer_id=$1`, [
          family.id,
        ]);
      const kept = (
        await client.query(
          "SELECT EXISTS(SELECT 1 FROM jdatna.conversations WHERE producer_id=$1) OR EXISTS(SELECT 1 FROM jdatna.reports WHERE producer_id=$1) AS kept",
          [family.id],
        )
      ).rows[0].kept as boolean;
      if (kept)
        // يبقى سطر الأسرة فقط لربط محادثاتها وبلاغاتها، موقوفًا ومخفيًا بلا بيانات.
        await del(
          `UPDATE jdatna.producer_profiles SET status='suspended',name='أسرة محذوفة',trade_name=NULL,description='',
             neighborhood=NULL,phone='—',whatsapp=NULL,logo_url=NULL,cover_url=NULL,verified=false,updated_at=now()
           WHERE id=$1`,
          [family.id],
        );
      else
        await del("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          family.id,
        ]);
    }
    const documents = (
      await client.query(
        "DELETE FROM jdatna.producer_documents WHERE user_id=$1 RETURNING object_key",
        [user.id],
      )
    ).rows.map((r) => r.object_key as string);
    for (const sql of [
      "DELETE FROM jdatna.reports WHERE reporter_id=$1 AND producer_id IS NULL",
      "DELETE FROM jdatna.offer_preferences WHERE user_id=$1",
      "DELETE FROM jdatna.push_subscriptions WHERE user_id=$1",
      "DELETE FROM jdatna.sessions WHERE user_id=$1",
    ])
      await del(sql, [user.id]);
    // يبقى سطر المستخدم لربط محادثاته، باسمه موسومًا بالحذف ليُعرف عند النزاع.
    await client.query(
      `UPDATE jdatna.users SET name=left(name,100)||' (حساب محذوف)',phone=$2,username=NULL,password_hash=NULL,
         permissions='{}',suspended_at=now(),deleted_at=now() WHERE id=$1`,
      [user.id, `deleted:${user.id}`],
    );
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,target_id,details) VALUES($1,$2,'account.delete',$2,$3)",
      [randomUUID(), user.id, JSON.stringify({ family: Boolean(family) })],
    );
    return documents;
  });
  // ملفات المستندات الخاصة تُحذف من التخزين بعد الحفظ؛ تعذّر الحذف لا يعيد الحساب.
  if (objectKeys.length) {
    try {
      const { storage } = await import("./storage");
      const client = storage();
      await Promise.all(
        objectKeys.map((Key) =>
          client
            .send(
              new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key }),
            )
            .catch(() => {}),
        ),
      );
    } catch {
      // التخزين غير مهيأ في هذه البيئة.
    }
  }
  return { deleted: true };
}

/** للتأكد في الاختبارات: هل الحساب محذوف؟ */
export async function isDeleted(id: string) {
  return Boolean(
    (await db().query("SELECT deleted_at FROM jdatna.users WHERE id=$1", [id]))
      .rows[0]?.deleted_at,
  );
}
