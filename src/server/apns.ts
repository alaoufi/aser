import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";

/**
 * إشعارات تطبيق الآيفون عبر Apple (APNs). التطبيق (غلاف Capacitor) يعطي الموقع رمز الجهاز،
 * والخادم يرسل إليه بمفتاح Apple (.p8) من متغيرات الخادم:
 *   APNS_KEY_ID          رقم المفتاح (10 أحرف)
 *   APNS_KEY_P8_BASE64   محتوى ملف .p8 مرمّزًا base64 في سطر واحد
 *   APNS_TEAM_ID         فريق Apple (الافتراضي F6RN596WCX)
 * بلا مفتاح لا يُرسل شيء ولا يتعطل أي طلب.
 */
const TOPIC = "com.jdatna.app";
const HOST = "https://api.push.apple.com";

export type ApnsMessage = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};
/** نتيجة الإرسال لجهاز واحد: رمز HTTP وسبب Apple إن رُفض. */
export type ApnsResult = { status: number; reason?: string };
type ApnsTransport = (
  token: string,
  payload: string,
  headers: Record<string, string>,
) => Promise<ApnsResult>;

export function apnsConfigured() {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_KEY_P8_BASE64);
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
let jwt: { value: string; at: number } | null = null;
/** رمز الإرسال (JWT بتوقيع ES256): Apple تقبله ساعة، فيُجدَّد كل 50 دقيقة. */
function bearer() {
  if (jwt && Date.now() - jwt.at < 50 * 60 * 1000) return jwt.value;
  const keyId = process.env.APNS_KEY_ID ?? "";
  const team = process.env.APNS_TEAM_ID || "F6RN596WCX";
  const key = createPrivateKey(
    Buffer.from(process.env.APNS_KEY_P8_BASE64 ?? "", "base64").toString(
      "utf8",
    ),
  );
  const iat = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: "ES256", kid: keyId }))}.${b64url(JSON.stringify({ iss: team, iat }))}`;
  const signature = sign("sha256", Buffer.from(body), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  jwt = { value: `${body}.${b64url(signature)}`, at: Date.now() };
  return jwt.value;
}

/** الإرسال الحقيقي: اتصال HTTP/2 بخادم Apple لكل دفعة إشعارات. */
const http2Transport: ApnsTransport = (token, payload, headers) =>
  new Promise((resolve) => {
    const session = connect(HOST);
    const done = (r: ApnsResult) => {
      session.close();
      resolve(r);
    };
    session.on("error", () => done({ status: 0, reason: "connection" }));
    session.setTimeout(10_000, () => done({ status: 0, reason: "timeout" }));
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      ...headers,
    });
    let status = 0;
    let data = "";
    req.on("response", (h) => {
      status = Number(h[":status"]);
    });
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data).reason as string) : undefined;
      } catch {}
      done({ status, reason });
    });
    req.on("error", () => done({ status: 0, reason: "request" }));
    req.end(payload);
  });

let transport: ApnsTransport | null = null;
/** للاختبارات فقط: بديل عن خادم Apple. */
export function setApnsTransport(t: ApnsTransport | null) {
  transport = t;
}

const tokenSchema = z
  .object({ token: z.string().regex(/^[0-9a-fA-F]{64,200}$/) })
  .strict();

/** يربط جهاز الآيفون بإشعارات الحساب الحالي (الجهاز لحساب واحد). */
export async function registerApnsDevice(user: SessionUser, input: unknown) {
  const token = tokenSchema.parse(input).token.toLowerCase();
  await db().query(
    `INSERT INTO jdatna.apns_devices(token,user_id) VALUES($1,$2)
     ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id`,
    [token, user.id],
  );
  return { registered: true };
}

export async function removeApnsDevice(user: SessionUser, input: unknown) {
  const token = tokenSchema.parse(input).token.toLowerCase();
  await db().query(
    "DELETE FROM jdatna.apns_devices WHERE token=$1 AND user_id=$2",
    [token, user.id],
  );
  return { registered: false };
}

/**
 * يرسل الإشعار لكل أجهزة آيفون المستخدم. لا يرمي أبدًا، والرمز الذي ترفضه Apple لأن التطبيق
 * حُذف أو الرمز تغيّر (410، أو BadDeviceToken/Unregistered) يُحذف.
 */
export async function notifyApns(userId: string, message: ApnsMessage) {
  try {
    const send = transport ?? (apnsConfigured() ? http2Transport : null);
    if (!send) return 0;
    const tokens = (
      await db().query<{ token: string }>(
        "SELECT token FROM jdatna.apns_devices WHERE user_id=$1",
        [userId],
      )
    ).rows.map((r) => r.token);
    if (!tokens.length) return 0;
    const payload = JSON.stringify({
      aps: {
        alert: { title: message.title, body: message.body },
        sound: "default",
        ...(message.tag ? { "thread-id": message.tag } : {}),
      },
      url: message.url,
    });
    const headers = {
      authorization: `bearer ${transport ? "test" : bearer()}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 3600),
      ...(message.tag ? { "apns-collapse-id": message.tag.slice(0, 64) } : {}),
    };
    let sent = 0;
    await Promise.all(
      tokens.map(async (token) => {
        const r = await send(token, payload, headers).catch((): ApnsResult => ({
          status: 0,
        }));
        if (r.status === 200) {
          sent++;
          await db().query(
            "UPDATE jdatna.apns_devices SET last_used_at=now() WHERE token=$1",
            [token],
          );
        } else if (
          r.status === 410 ||
          r.reason === "BadDeviceToken" ||
          r.reason === "Unregistered" ||
          r.reason === "DeviceTokenNotForTopic"
        )
          await db().query("DELETE FROM jdatna.apns_devices WHERE token=$1", [
            token,
          ]);
      }),
    );
    return sent;
  } catch {
    return 0;
  }
}
