import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { createAdminSession, hash } from "../src/server/auth";
import { ratingSummary } from "../src/server/ratings";
import { awardIfEligible } from "../src/server/certificates";

/**
 * إصلاحات المراجعة الأمنية 2026-11-25 (قاعدة اختبار معزولة فقط):
 * 1) التقييم والشهادة بالمقيِّمين المختلفين: حساب ثانٍ بطلبات متكررة لا يصنع «أسرة مميزة».
 * 2) لوحة الإدارة مع خطوتي الدخول تشترط جلسة كلمة المرور + رمز الجوال، لا «نسيت كلمة المرور» وحده.
 */
const skip = process.env.JDATNA_TEST_DB !== "true";
const phoneNo = () =>
  "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
async function isolated() {
  const pool = db();
  assert.match(
    (await pool.query("SELECT current_database() AS n")).rows[0].n,
    /^jdatna_test_/,
  );
  return pool;
}

test(
  "ratings and the certificate count distinct raters, not repeated orders",
  { skip },
  async () => {
    const pool = await isolated();
    const owner = randomUUID(),
      family = randomUUID(),
      alt = randomUUID();
    const raters = Array.from({ length: 10 }, () => randomUUID());
    const users = [owner, alt, ...raters];
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'مقيّم',$2,'customer',now())",
          [u, phoneNo()],
        );
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة التقييم',(SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1),$4,'approved')",
        [family, owner, "sr-" + family, phoneNo()],
      );
      const rate = (rater: string, stars: number) =>
        pool.query(
          "INSERT INTO jdatna.ratings(id,kind,target_id,rater_id,rater_role,stars,order_id) VALUES($1,'family',$2,$3,'member',$4,$5)",
          [randomUUID(), family, rater, stars, randomUUID()],
        );
      // حساب ثانٍ لصاحب الأسرة: 10 طلبات «مكتملة» و10 تقييمات بخمس نجوم.
      for (let i = 0; i < 10; i++) await rate(alt, 5);
      assert.deepEqual(await ratingSummary("family", family), {
        average: 5,
        count: 1,
      });
      assert.equal(await awardIfEligible(family), null);
      // عميل حقيقي واحد بنجمة: المتوسط صوتان متساويان (5 و1)، لا 10 أصوات مقابل واحد.
      await rate(raters[0], 1);
      assert.deepEqual(await ratingSummary("family", family), {
        average: 3,
        count: 2,
      });
      // 10 مقيِّمين مختلفين بخمس نجوم لأسرة لا نجمة واحدة فيها تستحق الشهادة.
      await pool.query("DELETE FROM jdatna.ratings WHERE target_id=$1", [
        family,
      ]);
      for (const r of raters) await rate(r, 5);
      assert.equal(await awardIfEligible(family), true);
      assert.equal(
        (
          await pool.query(
            "SELECT ratings_count FROM jdatna.certificates WHERE producer_id=$1",
            [family],
          )
        ).rows[0].ratings_count,
        10,
      );
    } finally {
      await pool.query("DELETE FROM jdatna.certificates WHERE producer_id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.ratings WHERE target_id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [users]);
    }
  },
);

test(
  "with two-step admin login, the panel needs a password+code session",
  { skip },
  async () => {
    const pool = await isolated();
    const id = randomUUID();
    const overrides = {
      ADMIN_LOGIN_OTP: "on",
      SMS_PROVIDER: "webhook",
      SMS_WEBHOOK_URL: "https://sms.invalid/send",
      SMS_ALLOWED_HOSTS: "sms.invalid",
      SMS_WEBHOOK_TOKEN: "mock-only",
      SMS_VERIFIED: "true",
      OTP_HASH_SECRET: "admin-mfa-test-secret-" + "x".repeat(32),
    };
    const prior = Object.fromEntries(
      Object.keys(overrides).map((k) => [k, process.env[k]]),
    );
    const session = async (mfa: boolean) => {
      const t = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',$3)",
        [hash(t), id, mfa],
      );
      return new Request("http://127.0.0.1:3000/api/auth/admin-session", {
        headers: { cookie: "jdatna_session=" + t },
      });
    };
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'مدير خطوتين',$2,'admin',now())",
        [id, phoneNo()],
      );
      Object.assign(process.env, overrides);
      // جلسة من «نسيت كلمة المرور» (رمز الجوال وحده): لا لوحة.
      await assert.rejects(createAdminSession(await session(false)), {
        status: 403,
      });
      // جلسة من كلمة المرور ثم رمز الجوال: تفتح اللوحة.
      assert.ok((await createAdminSession(await session(true))).token);
      // الخطوتان غير مفعّلتين: السلوك كما كان.
      process.env.ADMIN_LOGIN_OTP = "off";
      assert.ok((await createAdminSession(await session(false))).token);
    } finally {
      for (const [k, v] of Object.entries(prior))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
    }
  },
);
