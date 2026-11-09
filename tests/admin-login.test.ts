import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  ADMIN_PASSWORD_MIN,
  hashPassword,
  passwordLogin,
  setCredentials,
} from "../src/server/credentials";
import {
  hash,
  otpPurposeSchema,
  verifyAdminLogin,
  verifyOtp,
} from "../src/server/auth";
import { db } from "../src/server/db";

test("public OTP endpoints never accept the admin purpose", () => {
  assert.equal(otpPurposeSchema.safeParse("admin").success, false);
  assert.equal(ADMIN_PASSWORD_MIN >= 10, true);
});

test(
  "admin password login requires an SMS code before any session exists",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const name = (await db().query("SELECT current_database() AS name")).rows[0]
      .name as string;
    assert.ok(
      name.startsWith("jdatna_test_"),
      "Requires jdatna_test_ database",
    );
    const tag = randomUUID().slice(0, 8);
    const overrides: Record<string, string> = {
      OTP_HASH_SECRET: "test-only-admin-login-secret-" + tag + "-padding",
      SMS_PROVIDER: "taqnyat",
      SMS_WEBHOOK_URL: "https://api.taqnyat.sa/v1/messages",
      SMS_WEBHOOK_TOKEN: "test-only",
      SMS_SENDER: "test",
      SMS_VERIFIED: "true",
      S3_BUCKET: "admin-login-test",
      S3_REGION: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      DOCUMENT_ENCRYPTION_KEY: "a".repeat(64),
      PRIVATE_STORAGE_VERIFIED: "true",
    };
    const prior = Object.fromEntries(
      [...Object.keys(overrides), "ADMIN_LOGIN_OTP"].map((k) => [
        k,
        process.env[k],
      ]),
    );
    Object.assign(process.env, overrides);
    delete process.env.ADMIN_LOGIN_OTP;
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      sent.push(body.body);
      return new Response(
        JSON.stringify({
          statusCode: 201,
          messageId: "1",
          accepted: `[${body.recipients[0]}]`,
          rejected: "[]",
        }),
        { status: 201 },
      );
    }) as typeof fetch;
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const admin = { id: randomUUID(), phone: phone() };
    const customer = { id: randomUUID(), phone: phone() };
    const password = "short-" + tag.slice(0, 2); // كلمة قديمة قصيرة تبقى صالحة للدخول بخطوتين
    try {
      const passwordHash = await hashPassword(password);
      for (const [u, role] of [
        [admin, "admin"],
        [customer, "customer"],
      ] as const)
        await db().query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,'اختبار',$2,$3,now(),$4)",
          [u.id, u.phone, role, passwordHash],
        );
      const sessions = async (id: string) =>
        (
          await db().query(
            "SELECT count(*)::int AS n FROM jdatna.sessions WHERE user_id=$1",
            [id],
          )
        ).rows[0].n as number;

      const step1 = await passwordLogin({ identifier: admin.phone, password });
      assert.ok(step1.otp?.challengeId);
      assert.equal(step1.token, null);
      assert.equal(await sessions(admin.id), 0, "no admin session before code");
      const code = /(\d{4})$/.exec(sent.at(-1) ?? "")?.[1];
      assert.ok(code, "admin code sent by SMS");
      assert.match(sent.at(-1)!, /دخول إدارة/);

      assert.equal(
        await verifyOtp(step1.otp!.challengeId, code!),
        null,
        "signup/reset verifier never consumes an admin challenge",
      );
      const wrong = code === "1111" ? "2222" : "1111";
      assert.equal(await verifyAdminLogin(step1.otp!.challengeId, wrong), null);
      const done = await verifyAdminLogin(step1.otp!.challengeId, code!);
      assert.ok(done);
      assert.equal(done.user.role, "admin");
      assert.equal(await sessions(admin.id), 1);
      assert.equal(
        await verifyAdminLogin(step1.otp!.challengeId, code!),
        null,
        "codes are single use",
      );

      const plain = await passwordLogin({
        identifier: customer.phone,
        password,
      });
      assert.equal(plain.otp, undefined);
      assert.ok(plain.token, "non-admin accounts keep one-step login");

      process.env.ADMIN_LOGIN_OTP = "off";
      const emergency = await passwordLogin({
        identifier: admin.phone,
        password,
      });
      assert.ok(
        emergency.token,
        "emergency switch restores one-step admin login",
      );
      delete process.env.ADMIN_LOGIN_OTP;

      // تعيين كلمة مرور جديدة للمدير يتطلب 10 خانات على الأقل.
      const setupToken = randomBytes(32).toString("hex");
      await db().query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,setup_until,setup_only) VALUES($1,$2,now()+interval '10 minutes',now()+interval '10 minutes',true)",
        [hash(setupToken), admin.id],
      );
      const request = new Request("http://localhost/", {
        headers: { cookie: "jdatna_session=" + setupToken },
      });
      await assert.rejects(setCredentials(request, { password: "abcd1234" }), {
        status: 400,
      });
      const strong = await setCredentials(request, {
        password: "strong-admin-pass-" + tag,
      });
      assert.equal(strong.user.role, "admin");
    } finally {
      globalThis.fetch = realFetch;
      for (const [k, v] of Object.entries(prior))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      await db().query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [[admin.id, customer.id]],
      );
      await db().query(
        "DELETE FROM jdatna.otp_challenges WHERE phone=ANY($1::text[])",
        [[admin.phone, customer.phone]],
      );
      await db().query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [admin.id, customer.id],
      ]);
    }
  },
);

test(
  "admin summary and order oversight are admin-only",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const { adminSummary, adminOrders } = await import("../src/server/admin");
    const customer = {
      id: randomUUID(),
      name: "عميل",
      phone: "+966500000000",
      role: "customer" as const,
    };
    await assert.rejects(adminSummary(customer), { status: 403 });
    await assert.rejects(adminOrders(customer), { status: 403 });
    const admin = { ...customer, role: "admin" as const };
    const summary = await adminSummary(admin);
    for (const key of [
      "familiesPending",
      "familiesApproved",
      "familiesIncomplete",
      "reportsOpen",
      "ordersToday",
      "ordersStale",
      "productsLive",
    ])
      assert.equal(typeof summary[key], "number", key);
    assert.ok(Array.isArray(await adminOrders(admin)));
  },
);
