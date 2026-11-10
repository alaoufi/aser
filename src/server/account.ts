import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";

/** العبارة التي يكتبها المستخدم لتأكيد الحذف النهائي. */
export const DELETE_CONFIRMATION = "حذف حسابي";

/**
 * حذف الحساب من داخل التطبيق (شرط آبل وقوقل بلاي): تُمسح البيانات الشخصية نهائيًا
 * ويتعطل الحساب، وتبقى سجلات الطلبات والمحادثات عند الطرف الآخر بلا اسم ولا جوال.
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

    // الأسرة المنتجة: تُخفى نهائيًا وتُمسح بياناتها ومستنداتها.
    const family = (
      await client.query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
        [user.id],
      )
    ).rows[0] as { id: string } | undefined;
    if (family) {
      await client.query(
        `UPDATE jdatna.producer_profiles SET status='suspended',name='أسرة محذوفة',trade_name=NULL,description='',
           neighborhood=NULL,phone='—',whatsapp=NULL,logo_url=NULL,cover_url=NULL,verified=false,updated_at=now()
         WHERE id=$1`,
        [family.id],
      );
      await client.query(
        `UPDATE jdatna.products SET visible=false,status='unavailable',image_url=NULL,description='',story=NULL,updated_at=now()
         WHERE producer_id=$1`,
        [family.id],
      );
      for (const table of [
        "producer_private",
        "producer_social_links",
        "pickup_locations",
        "producer_zones",
        "producer_coverage_details",
        "photo_library",
      ])
        await client.query(`DELETE FROM jdatna.${table} WHERE producer_id=$1`, [
          family.id,
        ]);
    }
    const documents = (
      await client.query(
        "DELETE FROM jdatna.producer_documents WHERE user_id=$1 RETURNING object_key",
        [user.id],
      )
    ).rows.map((r) => r.object_key as string);

    // طلباته تبقى للأسرة بلا اسم ولا جوال ولا ملاحظات، ومنفصلة عن الحساب.
    await client.query(
      "UPDATE jdatna.order_requests SET user_id=NULL,customer_name='عميل محذوف',phone='—',notes='',updated_at=now() WHERE user_id=$1",
      [user.id],
    );
    await client.query(
      "UPDATE jdatna.messages SET body='رسالة من حساب محذوف' WHERE sender_id=$1",
      [user.id],
    );
    for (const sql of [
      "DELETE FROM jdatna.ratings WHERE rater_id=$1",
      "DELETE FROM jdatna.offer_preferences WHERE user_id=$1",
      "DELETE FROM jdatna.push_subscriptions WHERE user_id=$1",
      "DELETE FROM jdatna.sessions WHERE user_id=$1",
    ])
      await client.query(sql, [user.id]);
    await client.query(
      `UPDATE jdatna.users SET name='حساب محذوف',phone=$2,username=NULL,password_hash=NULL,permissions='{}',
         suspended_at=now(),deleted_at=now() WHERE id=$1`,
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
