import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  hashPassword,
  loginScope,
  passwordLogin,
} from "../src/server/credentials";
import { hash } from "../src/server/auth";
import { db } from "../src/server/db";

test(
  "isolated login: a daily cap per account stops slow guessing of short passwords, and a correct login resets it",
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
    // اليومي لكل اسم دخول مع مصدره (مراجعة 2026-11-25): الاختبار بلا عنوان زائر = «unknown».
    const dayKey = "password-login-day:" + loginScope(phone, null),
      shortKey = "password-login:" + hash(phone);
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,'حد يومي',$2,'customer',now(),$3)",
        [id, phone, await hashPassword("4321")],
      );
      // دخول صحيح يصفّر العداد اليومي.
      await pool.query(
        "INSERT INTO jdatna.rate_limits(key,count,reset_at) VALUES($1,5,now()+interval '1 day')",
        [dayKey],
      );
      const ok = await passwordLogin({ identifier: phone, password: "4321" });
      assert.ok(ok.token);
      assert.equal(
        (
          await pool.query("SELECT 1 FROM jdatna.rate_limits WHERE key=$1", [
            dayKey,
          ])
        ).rowCount,
        0,
      );
      // بلغ 30 محاولة اليوم: يُرفض حتى الدخول الصحيح إلى اليوم التالي.
      await pool.query(
        "INSERT INTO jdatna.rate_limits(key,count,reset_at) VALUES($1,30,now()+interval '1 day')",
        [dayKey],
      );
      await assert.rejects(
        passwordLogin({ identifier: phone, password: "4321" }),
        { status: 429 },
      );
      // مصدر آخر (صاحب الحساب من جهازه) لا يتأثر بمحاولات غيره اليومية.
      const owner = await passwordLogin(
        { identifier: phone, password: "4321" },
        "owner-device",
      );
      assert.ok(owner.token);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key=ANY($1::text[])",
        [
          [
            dayKey,
            shortKey,
            "password-login-day:" + loginScope(phone, "owner-device"),
          ],
        ],
      );
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
    }
  },
);
