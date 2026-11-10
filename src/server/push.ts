import webpush from "web-push";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { databaseConfigured, db } from "./db";

/** محتوى إشعار الجوال: يظهر خارج الموقع ويفتح الرابط عند الضغط. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** يستبدل الإشعار السابق بنفس الوسم بدل تكديسه. */
  tag?: string;
};
type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};
type Transport = (sub: Subscription, payload: string) => Promise<unknown>;

let keys: { publicKey: string; privateKey: string } | null = null;
/** مفاتيح VAPID: تُولَّد مرة على الخادم وتُحفظ في القاعدة، لا في الكود ولا في الإعدادات. */
async function vapid() {
  if (keys) return keys;
  const read = async () =>
    (
      await db().query(
        `SELECT public_key AS "publicKey",private_key AS "privateKey" FROM jdatna.push_config WHERE id=1`,
      )
    ).rows[0] as typeof keys;
  keys = await read();
  if (!keys) {
    const fresh = webpush.generateVAPIDKeys();
    await db().query(
      "INSERT INTO jdatna.push_config(id,public_key,private_key) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING",
      [fresh.publicKey, fresh.privateKey],
    );
    keys = await read();
  }
  return keys!;
}

/** المفتاح العام فقط، ليشترك به المتصفح. */
export async function pushPublicKey() {
  return (await vapid()).publicKey;
}

const subscriptionSchema = z
  .object({
    endpoint: z
      .url()
      .max(1000)
      .refine((u) => u.startsWith("https://"), "رابط الاشتراك غير صالح"),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().min(20).max(200),
        auth: z.string().min(10).max(100),
      })
      .strict(),
  })
  .strict();

/** يربط جهاز المستخدم بإشعارات حسابه (جهاز واحد لحساب واحد). */
export async function subscribePush(user: SessionUser, input: unknown) {
  const s = subscriptionSchema.parse(input);
  await db().query(
    `INSERT INTO jdatna.push_subscriptions(endpoint,user_id,p256dh,auth) VALUES($1,$2,$3,$4)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth`,
    [s.endpoint, user.id, s.keys.p256dh, s.keys.auth],
  );
  return { subscribed: true };
}

export async function unsubscribePush(user: SessionUser, input: unknown) {
  const { endpoint } = z
    .object({ endpoint: z.string().max(1000) })
    .parse(input);
  await db().query(
    "DELETE FROM jdatna.push_subscriptions WHERE endpoint=$1 AND user_id=$2",
    [endpoint, user.id],
  );
  return { subscribed: false };
}

let transport: Transport | null = null;
/** للاختبارات فقط: بديل عن الإرسال الحقيقي. */
export function setPushTransport(t: Transport | null) {
  transport = t;
}

/**
 * يرسل إشعارًا لكل أجهزة المستخدم. لا يرمي أبدًا: فشل الإشعار لا يوقف الطلب أو الرسالة،
 * والاشتراك المنتهي (404/410) يُحذف.
 */
export async function notifyUser(userId: string, payload: PushPayload) {
  try {
    if (!databaseConfigured()) return 0;
    const subs = (
      await db().query(
        "SELECT endpoint,p256dh,auth FROM jdatna.push_subscriptions WHERE user_id=$1",
        [userId],
      )
    ).rows as { endpoint: string; p256dh: string; auth: string }[];
    if (!subs.length) return 0;
    const v = await vapid();
    const body = JSON.stringify(payload);
    const send: Transport =
      transport ??
      ((sub, data) =>
        webpush.sendNotification(sub, data, {
          TTL: 60 * 60 * 24,
          urgency: "high",
          vapidDetails: {
            subject: "https://jdatna.com",
            publicKey: v.publicKey,
            privateKey: v.privateKey,
          },
        }));
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await send(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
          await db().query(
            "UPDATE jdatna.push_subscriptions SET last_used_at=now() WHERE endpoint=$1",
            [s.endpoint],
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await db().query(
              "DELETE FROM jdatna.push_subscriptions WHERE endpoint=$1",
              [s.endpoint],
            );
        }
      }),
    );
    return sent;
  } catch {
    return 0;
  }
}
