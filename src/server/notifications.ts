import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { databaseConfigured, db } from "./db";

/**
 * جرس «الإشعارات» (قرار المالك 2026-11-27): كل إشعار يُرسل للعضو يُحفظ ليجده في الموقع والتطبيق
 * بعد أن يختفي من شريط الجوال. الوسم نفسه يستبدل غير المقروء السابق (كما يفعل الجوال).
 */
export async function saveNotification(
  userId: string,
  n: { title: string; body: string; url: string; tag?: string },
) {
  if (!databaseConfigured()) return;
  try {
    if (n.tag)
      await db().query(
        "DELETE FROM jdatna.notifications WHERE user_id=$1 AND tag=$2 AND read_at IS NULL",
        [userId, n.tag],
      );
    await db().query(
      "INSERT INTO jdatna.notifications(id,user_id,title,body,url,tag) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        userId,
        n.title.slice(0, 200),
        (n.body ?? "").slice(0, 1000),
        safeUrl(n.url),
        n.tag ?? null,
      ],
    );
    // آخر ٢٠٠ فقط.
    await db().query(
      `DELETE FROM jdatna.notifications WHERE user_id=$1 AND id NOT IN
         (SELECT id FROM jdatna.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200)`,
      [userId],
    );
  } catch {
    // حفظ الإشعار لا يوقف الطلب أو الرسالة.
  }
}

/** روابط داخل الموقع فقط. */
function safeUrl(url: string) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//")
    ? url.slice(0, 500)
    : "/";
}

export async function myNotifications(user: SessionUser) {
  const [items, unread] = await Promise.all([
    db().query(
      `SELECT id,title,body,url,created_at AS "createdAt",(read_at IS NOT NULL) AS read
         FROM jdatna.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    ),
    db().query(
      "SELECT count(*)::int AS n FROM jdatna.notifications WHERE user_id=$1 AND read_at IS NULL",
      [user.id],
    ),
  ]);
  return {
    items: items.rows as {
      id: string;
      title: string;
      body: string;
      url: string;
      createdAt: string;
      read: boolean;
    }[],
    unread: unread.rows[0].n as number,
  };
}

const readSchema = z.union([
  z.object({ read: z.literal("all") }).strict(),
  z.object({ read: z.uuid() }).strict(),
]);
export async function readNotifications(user: SessionUser, input: unknown) {
  const v = readSchema.parse(input);
  await db().query(
    v.read === "all"
      ? "UPDATE jdatna.notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL"
      : "UPDATE jdatna.notifications SET read_at=now() WHERE user_id=$1 AND id=$2 AND read_at IS NULL",
    v.read === "all" ? [user.id] : [user.id, v.read],
  );
  return myNotifications(user);
}
