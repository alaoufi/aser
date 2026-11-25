import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash, requestOtp, verifyOtp } from "../src/server/auth";
import { db } from "../src/server/db";

/**
 * سقف يومي لكل جوال من كل مصدر (8 رموز و10 إدخالات)، وسقف أوسع للجوال كله (20 و30):
 * يمنع التخمين المتواصل، ولا يستنفد غريبٌ من جهازه حصة صاحب الجوال (مراجعة أمنية 2026-11-25).
 */
test(
  "a phone gets at most 8 codes and 10 code attempts a day, even with the right code",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const overrides = {
      SMS_PROVIDER: "webhook",
      SMS_WEBHOOK_URL: "https://sms.invalid/send",
      SMS_ALLOWED_HOSTS: "sms.invalid",
      SMS_WEBHOOK_TOKEN: "mock-only",
      SMS_VERIFIED: "true",
      PRIVATE_STORAGE_VERIFIED: "true",
      OTP_HASH_SECRET: "daily-cap-test-secret-" + randomUUID(),
      S3_BUCKET: "test",
      S3_REGION: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      DOCUMENT_ENCRYPTION_KEY:
        process.env.DOCUMENT_ENCRYPTION_KEY ?? "a".repeat(64),
    };
    const prior = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]]),
    );
    const originalFetch = globalThis.fetch;
    let code = "";
    const src = (k: string, from = "unknown") => k + hash(phone + "|" + from);
    const keys = [
      src("otp-phone:"),
      src("otp-phone-day:"),
      src("verify-phone-day:"),
      "otp-phone-all:" + hash(phone),
      "otp-phone-day-all:" + hash(phone),
      "verify-phone-day-all:" + hash(phone),
      src("otp-phone:", "owner"),
      src("otp-phone-day:", "owner"),
    ];
    try {
      Object.assign(process.env, overrides);
      globalThis.fetch = async (_url, init) => {
        code = JSON.parse(String(init?.body)).message.slice(-6);
        return Response.json({ accepted: true });
      };
      // اليوم استُنفدت فيه 10 إدخالات على هذا الجوال: حتى الرمز الصحيح يُرفض حتى الغد.
      const { challengeId } = await requestOtp(phone, "signup");
      await pool.query(
        "INSERT INTO jdatna.rate_limits(key,count,reset_at) VALUES($1,10,now()+interval '1 day')",
        [keys[2]],
      );
      await assert.rejects(verifyOtp(challengeId, code, "مختبر", "signup"), {
        status: 429,
      });
      // المحاولة المرفوضة لا تُحتسب على الرمز نفسه.
      assert.equal(
        (
          await pool.query(
            "SELECT attempts,consumed_at FROM jdatna.otp_challenges WHERE id=$1",
            [challengeId],
          )
        ).rows[0].attempts,
        0,
      );
      // بعد مرور اليوم يعمل الرمز الصحيح.
      await pool.query("DELETE FROM jdatna.rate_limits WHERE key=$1", [
        keys[2],
      ]);
      assert.ok(await verifyOtp(challengeId, code, "مختبر", "signup"));
      // 8 رموز في اليوم: التاسع يُرفض.
      await pool.query("DELETE FROM jdatna.rate_limits WHERE key=$1", [
        keys[0],
      ]);
      await pool.query("UPDATE jdatna.rate_limits SET count=8 WHERE key=$1", [
        keys[1],
      ]);
      await assert.rejects(requestOtp(phone, "reset"), { status: 429 });
      // صاحب الجوال من جهاز آخر يطلب رمز الاستعادة رغم استنفاد غيره حصته.
      assert.ok((await requestOtp(phone, "reset", "owner")).challengeId);
      // والسقف الأوسع للجوال كله يبقى: 20 رمزًا في اليوم من كل المصادر.
      await pool.query("DELETE FROM jdatna.rate_limits WHERE key=ANY($1)", [
        [src("otp-phone:", "owner"), "otp-phone-all:" + hash(phone)],
      ]);
      await pool.query("UPDATE jdatna.rate_limits SET count=20 WHERE key=$1", [
        "otp-phone-day-all:" + hash(phone),
      ]);
      await assert.rejects(requestOtp(phone, "reset", "owner"), {
        status: 429,
      });
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(prior))
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      await pool.query("DELETE FROM jdatna.rate_limits WHERE key=ANY($1)", [
        keys,
      ]);
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id IN (SELECT id FROM jdatna.users WHERE phone=$1)",
        [phone],
      );
      await pool.query("DELETE FROM jdatna.otp_challenges WHERE phone=$1", [
        phone,
      ]);
      await pool.query(
        "DELETE FROM jdatna.security_events WHERE detail LIKE 'otp-phone%' OR detail LIKE 'verify-phone%'",
      );
      await pool.query("DELETE FROM jdatna.users WHERE phone=$1", [phone]);
    }
  },
);
