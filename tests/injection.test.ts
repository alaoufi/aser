import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/server/db";
import { passwordLogin } from "../src/server/credentials";
import { searchProducts, searchProducers } from "../src/server/catalog";

/** نصوص حقن SQL في الدخول والبحث تُعامل كبيانات عادية: لا خطأ قاعدة ولا تسريب ولا حذف. */
test(
  "SQL injection text is plain data in sign-in and public search",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    // الجدول باقٍ (العدد قد يتغير باختبارات متوازية، فلا يُقارن).
    const intact = async () =>
      (await pool.query("SELECT to_regclass('jdatna.users') IS NOT NULL AS ok"))
        .rows[0].ok as boolean;
    const attacks = [
      "' OR '1'='1",
      "admin'--",
      "1; DROP TABLE jdatna.users; --",
      "%' UNION SELECT password_hash FROM jdatna.users --",
    ];
    for (const identifier of attacks) {
      await assert.rejects(
        passwordLogin({ identifier, password: "' OR '1'='1" }),
        (e: { status?: number }) => e.status === 401 || e.status === 429,
      );
      const found = [
        ...(await searchProducts({ q: identifier })),
        ...(await searchProducers({ q: identifier })),
      ];
      assert.ok(!JSON.stringify(found).includes("scrypt$"), "no hash leaks");
    }
    // حقن وقت (pg_sleep 10 ثوانٍ) لا يُنفَّذ؛ الفارق واسع فلا يتأثر بضغط الاختبارات المتوازية.
    const started = Date.now();
    await searchProducts({ q: "x' AND pg_sleep(10)--" });
    assert.ok(Date.now() - started < 8000);
    assert.equal(await intact(), true, "users table intact");
    await pool.query(
      "DELETE FROM jdatna.rate_limits WHERE key LIKE 'password-login%'",
    );
  },
);
