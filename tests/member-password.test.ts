import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { updateMember } from "../src/server/members";
import { passwordLogin } from "../src/server/credentials";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated member password: only the full admin sets it, only for regular members, sessions end, nothing logged",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = (
      role: SessionUser["role"],
      name: string,
      permissions: string[] = [],
    ) => ({ id: randomUUID(), name, phone: phone(), role, permissions });
    const admin = mk("admin", "مدير"),
      staff = mk("customer", "مشرف", ["orders"]),
      other = mk("admin", "مدير آخر"),
      reviewer = mk("customer", "Reviewer account");
    const users = [admin, staff, other, reviewer];
    const secret = "Rev-" + randomUUID().slice(0, 12);
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
          [u.id, u.name, u.phone, u.role, u.permissions],
        );
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        ["t-" + reviewer.id, reviewer.id],
      );
      const set = (actor: SessionUser, id: string, password = secret) =>
        updateMember(actor, { action: "password", id, password });
      // المشرف بصلاحيات محددة لا يملك إدارة الأعضاء.
      await assert.rejects(set(staff, reviewer.id), { status: 403 });
      // حسابات الإدارة تعيّن كلمة مرورها بنفسها برمز الجوال.
      await assert.rejects(set(admin, other.id), { status: 403 });
      await assert.rejects(set(admin, staff.id), { status: 403 });
      // كلمة أقصر من أربع خانات مرفوضة (قرار المالك 2026-11-26: الحد الأدنى أربع).
      await assert.rejects(set(admin, reviewer.id, "123"));
      await set(admin, reviewer.id);
      // يخرج من أجهزته، ويدخل بالجوال وكلمة المرور دون رمز.
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.sessions WHERE user_id=$1",
            [reviewer.id],
          )
        ).rows[0].n,
        0,
      );
      const login = await passwordLogin({
        identifier: "0" + reviewer.phone.slice(4),
        password: secret,
      });
      assert.equal(login.otp, undefined);
      assert.ok(login.token);
      // كلمة المرور لا تُحفظ في سجل الإدارة.
      const logged = (
        await pool.query(
          "SELECT details::text AS d FROM jdatna.admin_audit_logs WHERE target_id=$1 AND action='member.password'",
          [reviewer.id],
        )
      ).rows;
      assert.equal(logged.length, 1);
      assert.ok(!logged[0].d.includes(secret));
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[]) OR target_id=ANY($1::uuid[])",
        [users.map((u) => u.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [users.map((u) => u.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE ANY($1::text[])",
        [users.map((u) => "%" + u.phone.slice(-8) + "%")],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
    }
  },
);
