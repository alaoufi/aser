import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  createAdminSession,
  hash,
  renewSession,
  sessionToken,
} from "../src/server/auth";
import {
  hashPassword,
  passwordLogin,
  setCredentials,
  LOGIN_WRONG_LIMIT,
} from "../src/server/credentials";

/**
 * لا قفل للحساب (قرار المالك 2026-11-25): بعد 5 محاولات خاطئة من الجهاز نفسه يتوقف الدخول منه
 * برسالة «تجاوزت الحد المسموح من محاولات الدخول» (ومعها زر الاستعادة في الواجهة)،
 * وصاحب الحساب يدخل من جهاز آخر، والاستعادة برمز الجوال تمسح الحد من كل الأجهزة.
 */
test(
  "five wrong passwords stop that device with the limit message; the account is never locked",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    assert.equal(LOGIN_WRONG_LIMIT, 5);
    const id = randomUUID();
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const limits = () =>
      pool.query("DELETE FROM jdatna.rate_limits WHERE key LIKE 'password-%'");
    try {
      await limits();
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,'مختبر الحد',$2,'customer',now(),$3)",
        [id, phone, await hashPassword("2468")],
      );
      const login = (password: string, source = "attacker") =>
        passwordLogin({ identifier: phone, password }, source).catch((e) => e);
      // محاولة خاطئة ثم صحيحة: يُصفَّر العداد.
      assert.equal((await login("1111")).status, 401);
      assert.ok((await login("2468")).token);
      for (let i = 1; i < LOGIN_WRONG_LIMIT; i++)
        assert.equal((await login("1111")).status, 401);
      // الخامسة: رسالة الحد، لا قفل.
      const fifth = await login("1111");
      assert.equal(fifth.status, 429);
      assert.equal(fifth.message, "تجاوزت الحد المسموح من محاولات الدخول");
      assert.deepEqual(fifth.details, { limit: true });
      assert.equal(fifth.justLimited, true);
      // من الجهاز نفسه حتى الكلمة الصحيحة تنتظر انتهاء المدة أو الاستعادة.
      assert.equal((await login("2468")).status, 429);
      // الحساب ليس مقفلًا: صاحبه يدخل من جهازه.
      assert.ok((await login("2468", "owner")).token);
      assert.equal(
        (
          await pool.query(
            "SELECT login_locked_at FROM jdatna.users WHERE id=$1",
            [id],
          )
        ).rows[0].login_locked_at,
        null,
      );
      // الاستعادة برمز الجوال تمسح الحد من كل الأجهزة.
      const setup = "ab".repeat(32);
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at,setup_until,setup_only) VALUES($1,$2,now()+interval '10 minutes',now()+interval '10 minutes',true)",
        [hash(setup), id],
      );
      const request = new Request("http://localhost/api/auth/credentials", {
        headers: { cookie: `jdatna_session=${setup}` },
      });
      assert.equal(sessionToken(request), setup);
      await setCredentials(request, { password: "9753" });
      assert.ok((await login("9753")).token);
    } finally {
      await limits();
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [id]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [id]);
    }
  },
);

test(
  "the admin panel session lasts 12 hours and is not renewed; personal sessions keep a year for everyone",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    const ids = [randomUUID(), randomUUID()];
    const phones = ids.map(
      () => "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
    );
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,password_hash) VALUES($1,'مدير',$3,'admin',now(),$5),($2,'عميل',$4,'customer',now(),$5)",
        [...ids, ...phones, await hashPassword("2468")],
      );
      // الجلسة تُقرأ بحساب صاحبها (لكل حساب جلسة واحدة في هذا الاختبار).
      const hours = async (phone: string, userId: string) => {
        await passwordLogin({ identifier: phone, password: "2468" });
        return (
          await pool.query(
            "SELECT extract(epoch FROM max(expires_at)-now())/3600 AS h FROM jdatna.sessions WHERE user_id=$1",
            [userId],
          )
        ).rows[0].h as number;
      };
      // قرار المالك 2026-11-21: الجلسة الشخصية سنة للجميع، والإدارة بجلسة مستقلة 12 ساعة.
      const personal = await hours(phones[0], ids[0]);
      assert.ok(personal > 364 * 24, String(personal));
      const member = await hours(phones[1], ids[1]);
      assert.ok(member > 364 * 24, String(member));
      // جلسة شخصية بملف دخول عشوائي من الاختبار نفسه، لا من نتيجة الدخول بكلمة المرور.
      const signIn = async (userId: string) => {
        const t = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [hash(t), userId],
        );
        return t;
      };
      const token = await signIn(ids[0]);
      const site = new Request("http://127.0.0.1:3000/api/session", {
        headers: { cookie: "jdatna_session=" + token },
      });
      const panel = await createAdminSession(site);
      const panelHours = (
        await pool.query(
          "SELECT extract(epoch FROM expires_at-now())/3600 AS h FROM jdatna.sessions WHERE token_hash=$1 AND scope='admin'",
          [hash(panel.token)],
        )
      ).rows[0].h as number;
      assert.ok(panelHours > 11.9 && panelHours <= 12, String(panelHours));
      // التجديد للجلسة الشخصية وحدها: ملف اللوحة في خانة الموقع لا يُجدَّد.
      const renewed = await renewSession(
        new Request("http://127.0.0.1:3000/api/session", {
          headers: { cookie: "jdatna_session=" + panel.token },
        }),
      );
      assert.equal(renewed, false);
      // العميل لا يحصل على جلسة لوحة.
      const customerToken = await signIn(ids[1]);
      await assert.rejects(
        createAdminSession(
          new Request("http://127.0.0.1:3000/api/session", {
            headers: { cookie: "jdatna_session=" + customerToken },
          }),
        ),
        { status: 403 },
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE 'password-login%'",
      );
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=ANY($1)", [
        ids,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [ids]);
    }
  },
);
