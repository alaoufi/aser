import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUsername,
  hashPassword,
  verifyPassword,
  roleDestination,
  credentialsSchema,
  passwordLogin,
  setCredentials,
} from "../src/server/credentials";
import {
  otpMessage,
  hash,
  sessionInfo,
  sessionUser,
  verifyOtp,
} from "../src/server/auth";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { db } from "../src/server/db";
import { POST as loginRoute } from "../src/app/api/auth/password-login/route";
import { POST as credentialsRoute } from "../src/app/api/auth/credentials/route";
import { GET as sessionRoute } from "../src/app/api/session/route";
import { POST as verifyRoute } from "../src/app/api/auth/verify-otp/route";
test("usernames normalize case and NFC, reject phone namespace and invalid/bounded characters", () => {
  assert.equal(normalizeUsername("  Family.Name_1-2  "), "family.name_1-2");
  assert.equal(normalizeUsername("جدتنا"), "جدتنا");
  assert.equal(normalizeUsername("Cafe\u0301"), "café");
  for (const value of [
    "ab",
    "a".repeat(41),
    "has space",
    "<script>",
    "0501234567",
    "050-1234567",
    "00966501234567",
    "966501234567",
  ])
    assert.throws(() => normalizeUsername(value));
});
test("passwords are salted scrypt hashes with bounded constant-time verification", async () => {
  const password = "A strong passphrase 123!";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.match(a, /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("Wrong passphrase", a), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
  assert.equal(await verifyPassword("a".repeat(129), a), false);
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword("a".repeat(129)));
});
test("credentials reject client authority fields and enforce password length", () => {
  assert.equal(
    credentialsSchema.safeParse({
      password: "1234567890",
      username: "valid-name",
    }).success,
    true,
  );
  for (const value of [
    { password: "short" },
    { password: "a".repeat(129) },
    { password: "1234567890", role: "admin" },
    { password: "1234567890", userId: "other" },
  ])
    assert.equal(credentialsSchema.safeParse(value).success, false);
});
test("role destinations use server roles only", () => {
  assert.equal(roleDestination("admin"), "/admin");
  assert.equal(roleDestination("producer"), "/dashboard");
  assert.equal(roleDestination("customer"), "/orders");
});
test("registration SMS has exact requested wording followed by four digits", () => {
  assert.equal(
    otpMessage("1234"),
    "رمز التحقق للتسجيل في موقع أكلات جدتنا 1234",
  );
  assert.throws(() => otpMessage("123456"));
});
test(
  "isolated credentials require one-use fresh OTP, preserve roles, rotate sessions and reject conflicting identities",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const users = ids.map((id, i) => ({
      id,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: ["customer", "producer", "admin"][i],
    }));
    const tag = randomUUID().slice(0, 8),
      username = "login-" + tag,
      password = "Initial private password!",
      changedPassword = "Changed private password!";
    const challengeIds: string[] = [],
      tokens: string[] = [],
      rateKeys: string[] = [];
    const origin = process.env.APP_ORIGIN || "http://localhost";
    const request = (token: string) =>
      new Request(origin + "/api/auth/credentials", {
        headers: { cookie: "jdatna_session=" + token },
      });
    const overrides = {
      S3_BUCKET: "credentials-test",
      S3_REGION: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      DOCUMENT_ENCRYPTION_KEY: "a".repeat(64),
      OTP_HASH_SECRET: "test-only-credentials-secret-" + tag,
      SMS_PROVIDER: "taqnyat",
      SMS_WEBHOOK_URL: "https://api.taqnyat.sa/v1/messages",
      SMS_WEBHOOK_TOKEN: "test-only",
      SMS_SENDER: "test",
      SMS_VERIFIED: "true",
      PRIVATE_STORAGE_VERIFIED: "true",
    };
    const prior = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]]),
    );
    async function session(
      userId: string,
      proof: "fresh" | "expired" | "none",
    ) {
      const token = randomBytes(32).toString("hex");
      tokens.push(token);
      await pool.query(
        `INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,setup_until,setup_only) VALUES($1,$2,now()+interval '1 hour',${proof === "fresh" ? "now()+interval '10 minutes'" : proof === "expired" ? "now()-interval '1 second'" : "NULL"},${proof !== "none"})`,
        [hash(token), userId],
      );
      return token;
    }
    async function challenge(phone: string) {
      const id = randomUUID();
      challengeIds.push(id);
      const digest = createHmac("sha256", process.env.OTP_HASH_SECRET!)
        .update(id + ":1234")
        .digest("hex");
      await pool.query(
        "INSERT INTO jdatna.otp_challenges(id,phone,code_hash,expires_at,purpose) VALUES($1,$2,$3,now()+interval '5 minutes','reset')",
        [id, phone, digest],
      );
      return id;
    }
    try {
      Object.assign(process.env, overrides);
      for (const user of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'credentials fixture',$3,now())",
          [user.id, user.phone, user.role],
        );
      const ordinary = await session(ids[0], "none"),
        expired = await session(ids[0], "expired");
      await pool.query(
        "UPDATE jdatna.sessions SET setup_until=now()+interval '10 minutes' WHERE token_hash=$1",
        [hash(ordinary)],
      );
      assert.equal(
        (await sessionUser(request(ordinary)))?.id,
        ids[0],
        "Existing normal sessions remain authenticated, even with legacy setup timestamps",
      );
      await assert.rejects(
        setCredentials(request(ordinary), { password, username }),
        { status: 403 },
      );
      await assert.rejects(
        setCredentials(request(expired), { password, username }),
        { status: 403 },
      );
      assert.equal((await sessionInfo(request(ordinary)))?.hasPassword, false);
      assert.equal(
        (await sessionInfo(request(ordinary)))?.canSetCredentials,
        false,
      );
      const challengeId = await challenge(users[0].phone);
      const verified = await verifyOtp(challengeId, "1234");
      assert.ok(verified);
      tokens.push(verified.token);
      assert.equal(verified.user.role, "customer");
      assert.equal(await sessionInfo(request(verified.token)), null);
      assert.equal(await verifyOtp(challengeId, "1234"), null);
      const setup = await setCredentials(request(verified.token), {
        password,
        username: username.toUpperCase(),
      });
      tokens.push(setup.token);
      assert.equal(setup.user.username, username);
      assert.equal(setup.next, "/orders");
      assert.notEqual(setup.token, verified.token);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM jdatna.sessions WHERE user_id=$1",
            [ids[0]],
          )
        ).rows[0].count,
        1,
      );
      assert.equal(await sessionUser(request(ordinary)), null);
      await assert.rejects(
        setCredentials(request(verified.token), { password }),
        { status: 401 },
      );
      await assert.rejects(setCredentials(request(setup.token), { password }), {
        status: 403,
      });
      const metadata = await sessionRoute(request(setup.token), {}),
        metadataBody = await metadata.json();
      assert.equal(metadataBody.hasPassword, true);
      assert.equal(metadataBody.canSetCredentials, false);
      assert.equal("password_hash" in metadataBody.user, false);
      // Password access does not depend on SMS/storage enrollment gates.
      process.env.SMS_VERIFIED = "false";
      process.env.PRIVATE_STORAGE_VERIFIED = "false";
      const login = await passwordLogin({
        identifier: username.toUpperCase(),
        password,
      });
      tokens.push(login.token);
      assert.equal(login.user.id, ids[0]);
      assert.equal(login.next, "/orders");
      const byPhone = await passwordLogin({
        identifier: "0" + users[0].phone.slice(4),
        password,
      });
      tokens.push(byPhone.token);
      assert.equal(byPhone.user.id, ids[0]);
      const badBody = {
        identifier: username,
        password: "Wrong private password!",
      };
      const bad = await loginRoute(
        new Request(origin + "/api/auth/password-login", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(badBody),
        }),
        {},
      );
      const missingName = "missing-" + tag;
      const missing = await loginRoute(
        new Request(origin + "/api/auth/password-login", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ ...badBody, identifier: missingName }),
        }),
        {},
      );
      rateKeys.push("password-login:" + hash(missingName));
      assert.equal(bad.status, 401);
      assert.equal(missing.status, 401);
      assert.deepEqual(await bad.json(), await missing.json());
      const forged = await loginRoute(
        new Request(origin + "/api/auth/password-login", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            identifier: username,
            password,
            role: "admin",
          }),
        }),
        {},
      );
      assert.equal(forged.status, 400);
      const csrf = await credentialsRoute(
        new Request(origin + "/api/auth/credentials", {
          method: "POST",
          headers: { cookie: "jdatna_session=" + login.token },
          body: JSON.stringify({ password }),
        }),
        {},
      );
      assert.equal(csrf.status, 403);
      for (let i = 1; i < 3; i++) {
        const proof = await session(ids[i], "fresh");
        const own = await setCredentials(request(proof), {
          password,
          username: username + "-" + i,
        });
        tokens.push(own.token);
        const logged = await passwordLogin({
          identifier: username + "-" + i,
          password,
        });
        tokens.push(logged.token);
        assert.equal(logged.user.role, users[i].role);
        assert.equal(logged.next, i === 1 ? "/dashboard" : "/admin");
      }
      const resetProof = await session(ids[0], "fresh");
      await assert.rejects(
        setCredentials(request(resetProof), {
          password: changedPassword,
          username: username + "-1",
        }),
        { status: 409 },
      );
      assert.equal(
        (
          await pool.query(
            "SELECT setup_only AND setup_until>now() AS fresh FROM jdatna.sessions WHERE token_hash=$1",
            [hash(resetProof)],
          )
        ).rows[0]?.fresh,
        true,
        "conflicting setup rolls back without consuming OTP permission",
      );
      const afterConflict = await passwordLogin({
        identifier: username,
        password,
      });
      tokens.push(afterConflict.token);
      const reset = await setCredentials(request(resetProof), {
        password: changedPassword,
      });
      tokens.push(reset.token);
      assert.equal(
        reset.user.username,
        username,
        "omitting username preserves existing identity",
      );
      assert.equal(await sessionUser(request(login.token)), null);
      assert.equal(await sessionUser(request(afterConflict.token)), null);
      await assert.rejects(passwordLogin({ identifier: username, password }), {
        status: 401,
      });
      const afterReset = await passwordLogin({
        identifier: username,
        password: changedPassword,
      });
      tokens.push(afterReset.token);
      assert.equal(afterReset.user.id, ids[0]);
      // Two simultaneous attempts cannot reuse the same one-use capability.
      const once = await session(ids[0], "fresh");
      const attempts = await Promise.allSettled([
        setCredentials(request(once), { password: changedPassword }),
        setCredentials(request(once), { password: changedPassword }),
      ]);
      assert.equal(
        attempts.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const successful = attempts.find(
        (result) => result.status === "fulfilled",
      );
      if (successful?.status === "fulfilled")
        tokens.push(successful.value.token);
      // Verify the actual OTP route exposes setup permission and server-derived role.
      Object.assign(process.env, overrides);
      const routeChallenge = await challenge(users[2].phone);
      const otpResponse = await verifyRoute(
        new Request(origin + "/api/auth/verify-otp", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: routeChallenge,
            code: "1234",
            purpose: "reset",
          }),
        }),
        {},
      );
      assert.equal(otpResponse.status, 200);
      const otpBody = await otpResponse.json();
      assert.equal(otpBody.canSetCredentials, true);
      assert.equal(otpBody.next, "/admin");
      assert.equal(otpBody.user.role, "admin");
      assert.match(
        otpResponse.headers.get("set-cookie") ?? "",
        /HttpOnly; SameSite=Lax/,
      );
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.query(
        "DELETE FROM jdatna.otp_challenges WHERE id=ANY($1::uuid[])",
        [challengeIds],
      );
      const identifiers = [
        username,
        username + "-1",
        username + "-2",
        ...users.map((user) => user.phone),
      ];
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key=ANY($1::text[])",
        [
          [
            ...rateKeys,
            ...tokens.map((token) => "credentials:" + hash(token)),
            ...identifiers.map(
              (identifier) => "password-login:" + hash(identifier),
            ),
            ...challengeIds.map((id) => "verify:" + id),
          ],
        ],
      );
      await pool.end();
    }
  },
);
