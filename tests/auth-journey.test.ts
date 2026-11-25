import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { hash } from "../src/server/auth";
import { POST as requestOtpRoute } from "../src/app/api/auth/request-otp/route";
import { POST as verifyOtpRoute } from "../src/app/api/auth/verify-otp/route";
import { POST as credentialsRoute } from "../src/app/api/auth/credentials/route";
import { POST as passwordLoginRoute } from "../src/app/api/auth/password-login/route";
import { GET as sessionRoute } from "../src/app/api/session/route";
import { toAsciiDigits } from "../src/lib/digits";

const arabic = (s: string) =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + Number(d)));

// رحلة الحساب كاملة كما يمر بها المتصفح، عبر المسارات نفسها:
// تسجيل برمز الجوال، كلمة المرور، بقاء الدخول، تسجيل لم يكتمل، الدخول، استعادة كلمة المرور.
test(
  "isolated auth journey: signup, password, persistent session, unfinished signup, login, recovery — with Arabic digits",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const name = (await db().query("SELECT current_database() AS n")).rows[0].n;
    assert.ok(String(name).startsWith("jdatna_test_"));
    const origin = "https://jdatna.test";
    const overrides: Record<string, string> = {
      APP_ORIGIN: origin,
      OTP_HASH_SECRET: "test-only-journey-secret-" + randomUUID(),
      SMS_PROVIDER: "taqnyat",
      SMS_WEBHOOK_URL: "https://api.taqnyat.sa/v1/messages",
      SMS_WEBHOOK_TOKEN: "test-only",
      SMS_SENDER: "test",
      SMS_VERIFIED: "true",
      S3_BUCKET: "journey-test",
      S3_REGION: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      DOCUMENT_ENCRYPTION_KEY: "b".repeat(64),
      PRIVATE_STORAGE_VERIFIED: "true",
    };
    const prior = Object.fromEntries(
      Object.keys(overrides).map((k) => [k, process.env[k]]),
    );
    Object.assign(process.env, overrides);
    const sms: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      sms.push(body.body);
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
    const local =
      "05" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const intl = "+966" + local.slice(1);
    const ctx = { params: Promise.resolve({}) };
    const post = (url: string, body: unknown, cookie?: string) =>
      new Request(origin + url, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      });
    const cookieOf = (r: Response) => {
      const c = r.headers.get("set-cookie") ?? "";
      return { pair: c.split(";")[0], maxAge: /Max-Age=(\d+)/.exec(c)?.[1] };
    };
    const lastCode = () => /(\d{6})$/.exec(sms.at(-1) ?? "")?.[1] ?? "";
    const whoAmI = async (cookie: string) =>
      (
        await (
          await sessionRoute(
            new Request(origin + "/api/session", { headers: { cookie } }),
            ctx,
          )
        ).json()
      ).user;
    try {
      // 1) تسجيل جديد: الجوال والرمز بالأرقام العربية.
      let r = await requestOtpRoute(
        post("/api/auth/request-otp", {
          phone: arabic(local),
          purpose: "signup",
        }),
        ctx,
      );
      assert.equal(r.status, 200);
      let { challengeId } = await r.json();
      r = await verifyOtpRoute(
        post("/api/auth/verify-otp", {
          challengeId,
          code: arabic(lastCode()),
          purpose: "signup",
          name: "عميل الرحلة",
        }),
        ctx,
      );
      assert.equal(r.status, 200);
      // جلسة الإعداد قصيرة (10 دقائق) ولا تُعدّ دخولًا كاملًا قبل كلمة المرور.
      const setup = cookieOf(r);
      assert.equal(setup.maxAge, "600");
      assert.equal(await whoAmI(setup.pair), null);

      // 2) خرج قبل كلمة المرور ثم عاد يسجّل: يُكمل التسجيل، لا «الجوال مسجل».
      r = await requestOtpRoute(
        post("/api/auth/request-otp", { phone: local, purpose: "signup" }),
        ctx,
      );
      assert.equal(r.status, 200, "unfinished signup can resume");
      ({ challengeId } = await r.json());
      r = await verifyOtpRoute(
        post("/api/auth/verify-otp", {
          challengeId,
          code: lastCode(),
          purpose: "signup",
          name: "عميل الرحلة",
        }),
        ctx,
      );
      assert.equal(r.status, 200);
      const resumed = cookieOf(r);
      assert.equal(
        (
          await db().query(
            "SELECT count(*)::int AS n FROM jdatna.users WHERE phone=$1",
            [intl],
          )
        ).rows[0].n,
        1,
        "no duplicate account",
      );

      // 3) كلمة المرور بأرقام عربية: جلسة سنة كاملة، ويبقى الدخول بعد «إعادة فتح» الموقع.
      r = await credentialsRoute(
        post(
          "/api/auth/credentials",
          { password: arabic("4826") },
          resumed.pair,
        ),
        ctx,
      );
      assert.equal(r.status, 200);
      const full = cookieOf(r);
      assert.equal(full.maxAge, String(60 * 60 * 24 * 365));
      assert.equal((await whoAmI(full.pair))?.phone, intl);
      assert.equal((await whoAmI(full.pair))?.phone, intl, "still signed in");

      // 4) تسجيل جديد على حساب مكتمل: «الجوال مسجل».
      r = await requestOtpRoute(
        post("/api/auth/request-otp", { phone: local, purpose: "signup" }),
        ctx,
      );
      assert.equal(r.status, 409);

      // 5) الدخول: بالجوال وكلمة المرور، بأرقام عربية أو لاتينية.
      for (const [identifier, password] of [
        [arabic(local), arabic("4826")],
        [local, "4826"],
      ]) {
        r = await passwordLoginRoute(
          post("/api/auth/password-login", { identifier, password }),
          ctx,
        );
        assert.equal(r.status, 200, `${identifier} / ${password}`);
        assert.equal(cookieOf(r).maxAge, String(60 * 60 * 24 * 365));
      }
      r = await passwordLoginRoute(
        post("/api/auth/password-login", {
          identifier: local,
          password: "0000",
        }),
        ctx,
      );
      assert.equal(r.status, 401);

      // حد طلب الرمز: 3 لكل رقم كل ربع ساعة (حماية من الإزعاج وتكلفة الرسائل).
      r = await requestOtpRoute(
        post("/api/auth/request-otp", { phone: local, purpose: "reset" }),
        ctx,
      );
      assert.equal(r.status, 429);
      await db().query("DELETE FROM jdatna.rate_limits WHERE key=$1", [
        "otp-phone:" + hash(intl + "|unknown"),
      ]);
      // 6) استعادة كلمة المرور برمز الجوال: كلمة جديدة، والأجهزة الأخرى تخرج.
      r = await requestOtpRoute(
        post("/api/auth/request-otp", { phone: local, purpose: "reset" }),
        ctx,
      );
      assert.equal(r.status, 200);
      ({ challengeId } = await r.json());
      // رمز خاطئ يُرفض.
      r = await verifyOtpRoute(
        post("/api/auth/verify-otp", {
          challengeId,
          code: lastCode() === "1111" ? "2222" : "1111",
          purpose: "reset",
        }),
        ctx,
      );
      assert.equal(r.status, 400);
      r = await verifyOtpRoute(
        post("/api/auth/verify-otp", {
          challengeId,
          code: lastCode(),
          purpose: "reset",
        }),
        ctx,
      );
      assert.equal(r.status, 200);
      // الرمز يُستعمل مرة واحدة.
      const reused = await verifyOtpRoute(
        post("/api/auth/verify-otp", {
          challengeId,
          code: lastCode(),
          purpose: "reset",
        }),
        ctx,
      );
      assert.equal(reused.status, 400);
      r = await credentialsRoute(
        post("/api/auth/credentials", { password: "7391" }, cookieOf(r).pair),
        ctx,
      );
      assert.equal(r.status, 200);
      assert.equal(await whoAmI(full.pair), null, "old device signed out");
      r = await passwordLoginRoute(
        post("/api/auth/password-login", {
          identifier: local,
          password: "7391",
        }),
        ctx,
      );
      assert.equal(r.status, 200);
      r = await passwordLoginRoute(
        post("/api/auth/password-login", {
          identifier: local,
          password: "4826",
        }),
        ctx,
      );
      assert.equal(r.status, 401, "old password no longer works");

      // الرسائل كلها رمز من ستة أرقام، ولا شيء غيره.
      assert.ok(sms.every((m) => /^رمز التحقق .* \d{6}$/.test(m)));
      assert.equal(toAsciiDigits("٠٥١٢"), "0512");
    } finally {
      globalThis.fetch = realFetch;
      for (const [k, v] of Object.entries(prior))
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      const ids = (
        await db().query("SELECT id FROM jdatna.users WHERE phone=$1", [intl])
      ).rows.map((x) => x.id);
      await db().query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await db().query("DELETE FROM jdatna.otp_challenges WHERE phone=$1", [
        intl,
      ]);
      await db().query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE ANY($1::text[])",
        [["%" + hash(intl), "%" + hash(local), "password-login%"]],
      );
      await db().query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
    }
  },
);
