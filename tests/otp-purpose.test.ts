import { test } from "node:test";
import assert from "node:assert/strict";
import {
  otpPurposeSchema,
  requestOtp,
  verifyOtp,
  sessionUser,
  requireUser,
  hash,
} from "../src/server/auth";
import { setCredentials } from "../src/server/credentials";
import { db } from "../src/server/db";
import { randomUUID, randomBytes } from "node:crypto";
import { POST as requestRoute } from "../src/app/api/auth/request-otp/route";
import { POST as verifyRoute } from "../src/app/api/auth/verify-otp/route";
import { GET as sessionRoute } from "../src/app/api/session/route";
import { GET as historyRoute } from "../src/app/api/orders/route";
import { GET as adminRoute } from "../src/app/api/admin/producers/route";
test("OTP permits only explicit signup and reset purposes", () => {
  assert.equal(otpPurposeSchema.safeParse("signup").success, true);
  assert.equal(otpPurposeSchema.safeParse("reset").success, true);
  for (const value of [undefined, null, "login", "", "recover"])
    assert.equal(otpPurposeSchema.safeParse(value).success, false);
});
test(
  "isolated OTP purposes refuse SMS misuse and issue credential-only grants, never app sessions",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const phones = Array.from(
      { length: 4 },
      () => "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
    );
    const knownId = randomUUID(),
      raceId = randomUUID(),
      deletedId = randomUUID(),
      challengeIds: string[] = [],
      userIds = [knownId, raceId, deletedId];
    const issuedTokens: string[] = [],
      codes = new Map<string, string>();
    let sends = 0;
    const originalFetch = globalThis.fetch;
    const overrides = {
      SMS_PROVIDER: "webhook",
      SMS_WEBHOOK_URL: "https://sms.invalid/send",
      SMS_ALLOWED_HOSTS: "sms.invalid",
      SMS_WEBHOOK_TOKEN: "mock-only",
      SMS_VERIFIED: "true",
      PRIVATE_STORAGE_VERIFIED: "true",
      OTP_HASH_SECRET: "purpose-only-test-secret-" + randomUUID(),
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
    const origin = process.env.APP_ORIGIN || "http://localhost";
    const post = (path: string, body: unknown) =>
      new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const cookie = (token: string) =>
      new Request(origin + "/api/session", {
        headers: { cookie: "jdatna_session=" + token },
      });
    async function issue(phone: string, purpose: "signup" | "reset") {
      const result = await requestOtp(phone, purpose);
      challengeIds.push(result.challengeId);
      return result.challengeId;
    }
    try {
      Object.assign(process.env, overrides);
      globalThis.fetch = async (_url, init) => {
        sends++;
        const body = JSON.parse(String(init?.body));
        assert.match(
          body.message,
          /^رمز التحقق للتسجيل في موقع أكلات جدتنا \d{4}$/,
        );
        codes.set(body.to, body.message.slice(-4));
        return Response.json({ accepted: true });
      };
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'known admin','admin',now())",
        [knownId, phones[0]],
      );
      const ordinaryToken = randomBytes(32).toString("hex");
      issuedTokens.push(ordinaryToken);
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(ordinaryToken), knownId],
      );
      for (const purpose of [undefined, "login", "recover"]) {
        const invalid = await requestRoute(
          post("/api/auth/request-otp", {
            phone: phones[0],
            ...(purpose ? { purpose } : {}),
          }),
          {},
        );
        assert.equal(invalid.status, 400);
        const invalidVerify = await verifyRoute(
          post("/api/auth/verify-otp", {
            challengeId: randomUUID(),
            code: "1234",
            ...(purpose ? { purpose } : {}),
          }),
          {},
        );
        assert.equal(invalidVerify.status, 400);
      }
      await assert.rejects(requestOtp(phones[0], "signup"), { status: 409 });
      await assert.rejects(requestOtp(phones[1], "reset"), { status: 400 });
      assert.equal(
        sends,
        0,
        "Incompatible signup/reset requests must not send SMS",
      );
      const signup = await issue(phones[1], "signup");
      const wrongPurpose = await verifyRoute(
        post("/api/auth/verify-otp", {
          challengeId: signup,
          code: codes.get(phones[1]),
          purpose: "reset",
        }),
        {},
      );
      assert.equal(wrongPurpose.status, 400);
      const signupResponse = await verifyRoute(
        post("/api/auth/verify-otp", {
          challengeId: signup,
          code: codes.get(phones[1]),
          purpose: "signup",
          name: "New signup",
        }),
        {},
      );
      assert.equal(signupResponse.status, 200);
      const signupBody = await signupResponse.json();
      userIds.push(signupBody.user.id);
      assert.equal(signupBody.user.role, "customer");
      assert.equal(signupBody.canSetCredentials, true);
      const signupCookie = signupResponse.headers.get("set-cookie")!;
      assert.match(signupCookie, /Max-Age=600/);
      const grant = signupCookie.match(/jdatna_session=([a-f0-9]{64})/)![1];
      issuedTokens.push(grant);
      const grantRow = (
        await pool.query(
          "SELECT setup_only,expires_at<=now()+interval '10 minutes' AS short,setup_until>now() AS fresh FROM jdatna.sessions WHERE token_hash=$1",
          [hash(grant)],
        )
      ).rows[0];
      assert.deepEqual(grantRow, {
        setup_only: true,
        short: true,
        fresh: true,
      });
      assert.equal(await sessionUser(cookie(grant)), null);
      await assert.rejects(requireUser(cookie(grant)), { status: 401 });
      assert.equal((await sessionRoute(cookie(grant), {})).status, 200);
      assert.equal(
        (await (await sessionRoute(cookie(grant), {})).json()).user,
        null,
      );
      assert.equal((await historyRoute(cookie(grant), {})).status, 401);
      assert.equal((await adminRoute(cookie(grant), {})).status, 401);
      const created = await setCredentials(cookie(grant), {
        password: "New signup password!",
      });
      issuedTokens.push(created.token);
      assert.equal(
        (await sessionUser(cookie(created.token)))?.id,
        signupBody.user.id,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT setup_only FROM jdatna.sessions WHERE token_hash=$1",
            [hash(created.token)],
          )
        ).rows[0].setup_only,
        false,
      );
      await assert.rejects(
        setCredentials(cookie(grant), { password: "Another password!" }),
        { status: 401 },
      );
      const reset = await issue(phones[0], "reset");
      const resetting = await verifyOtp(
        reset,
        codes.get(phones[0])!,
        undefined,
        "reset",
      );
      assert.ok(resetting);
      issuedTokens.push(resetting.token);
      assert.equal(resetting.user.id, knownId);
      assert.equal(resetting.user.role, "admin");
      assert.equal(
        (await sessionUser(cookie(ordinaryToken)))?.id,
        knownId,
        "Issuing a setup grant preserves existing normal sessions",
      );
      await assert.rejects(requireUser(cookie(resetting.token), ["admin"]), {
        status: 401,
      });
      const recovered = await setCredentials(cookie(resetting.token), {
        password: "Recovered admin password!",
      });
      issuedTokens.push(recovered.token);
      assert.equal(
        (await requireUser(cookie(recovered.token), ["admin"])).id,
        knownId,
      );
      assert.equal(
        await sessionUser(cookie(ordinaryToken)),
        null,
        "Successful reset revokes old normal sessions",
      );
      // A phone becoming registered after signup SMS cannot be logged in through that signup code.
      const racing = await issue(phones[2], "signup");
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'race admin','admin',now())",
        [raceId, phones[2]],
      );
      assert.equal(
        await verifyOtp(racing, codes.get(phones[2])!, "Not owner", "signup"),
        null,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM jdatna.sessions WHERE user_id=$1",
            [raceId],
          )
        ).rows[0].count,
        0,
      );
      // Reset cannot create a user deleted after the SMS was requested.
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,'deleted reset',now())",
        [deletedId, phones[3]],
      );
      const deleted = await issue(phones[3], "reset");
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [deletedId]);
      assert.equal(
        await verifyOtp(deleted, codes.get(phones[3])!, undefined, "reset"),
        null,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM jdatna.users WHERE phone=$1",
            [phones[3]],
          )
        ).rows[0].count,
        0,
      );
      assert.equal(sends, 4);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [userIds],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        userIds,
      ]);
      await pool.query(
        "DELETE FROM jdatna.otp_challenges WHERE id=ANY($1::uuid[])",
        [challengeIds],
      );
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key=ANY($1::text[])",
        [
          [
            ...phones.map((phone) => "otp-phone:" + hash(phone)),
            ...challengeIds.map((id) => "verify:" + id),
            ...issuedTokens.map((token) => "credentials:" + hash(token)),
          ],
        ],
      );
      await pool.end();
    }
  },
);
