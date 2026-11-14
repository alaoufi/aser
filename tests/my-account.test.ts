import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  hashPassword,
  passwordLogin,
  updateMyAccount,
} from "../src/server/credentials";
import { hash } from "../src/server/auth";
import { db } from "../src/server/db";

test(
  "isolated my account: edits the name, changes the password with the current one, and signs other devices out",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const id = randomUUID(),
      phone =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const user = { id, name: "صاحب الحساب", phone, role: "admin" as const };
    const mine = randomBytes(32).toString("hex"),
      other = randomBytes(32).toString("hex");
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,$2,$3,'admin',now(),$4)",
        [id, user.name, phone, await hashPassword("1357")],
      );
      for (const t of [mine, other])
        await pool.query(
          "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
          [hash(t), id],
        );
      const request = new Request("http://localhost/", {
        headers: { cookie: "jdatna_session=" + mine },
      });
      assert.equal(
        (await updateMyAccount(user, request, { name: "  أبو محمد " })).name,
        "أبو محمد",
      );
      await assert.rejects(
        updateMyAccount(user, request, {
          currentPassword: "0000",
          newPassword: "2468",
        }),
        { status: 400 },
      );
      await updateMyAccount(user, request, {
        currentPassword: "1357",
        newPassword: "2468",
      });
      // الجهاز الحالي يبقى، والأجهزة الأخرى تخرج، والكلمة الجديدة تعمل.
      const left = (
        await pool.query(
          "SELECT token_hash FROM jdatna.sessions WHERE user_id=$1",
          [id],
        )
      ).rows.map((r) => r.token_hash);
      assert.deepEqual(left, [hash(mine)]);
      assert.ok(
        (await passwordLogin({ identifier: phone, password: "2468" })).token,
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE $1 OR key LIKE $2",
        ["my-account:" + id, "password-login%" + hash(phone)],
      );
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
    }
  },
);
