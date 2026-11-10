import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  hash,
  renewSession,
  SESSION_SECONDS,
  sessionCookie,
} from "../src/server/auth";

test("sign-in lasts a year and the cookie says so", () => {
  assert.equal(SESSION_SECONDS, 31536000);
  assert.match(sessionCookie("a".repeat(64)), /Max-Age=31536000/);
});

test(
  "isolated session renewal: an active session is extended a year from the last visit, once a day at most",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    const request = (t = token) =>
      new Request("https://test.invalid/", {
        headers: { cookie: "jdatna_session=" + t },
      });
    const days = async () =>
      Number(
        (
          await pool.query(
            "SELECT extract(epoch FROM expires_at-now())/86400 AS d FROM jdatna.sessions WHERE token_hash=$1",
            [hash(token)],
          )
        ).rows[0].d,
      );
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'جلسة دائمة',$2,'customer',now())",
        [
          id,
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        ],
      );
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '3 days')",
        [hash(token), id],
      );
      assert.equal(await renewSession(request()), true);
      assert.ok((await days()) > 364, "extended to a year");
      assert.equal(await renewSession(request()), false, "not twice a day");
      assert.equal(
        await renewSession(request(randomBytes(32).toString("hex"))),
        false,
        "unknown session is not created",
      );
    } finally {
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
      await pool.end();
    }
  },
);
