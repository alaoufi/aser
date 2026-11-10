import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { hash, sessionUser } from "../src/server/auth";
import { listMembers, updateMember } from "../src/server/members";
import {
  adminOrders,
  adminCategories,
  saveCategory,
} from "../src/server/admin";
import { adminProducers } from "../src/server/management";
import { can } from "../src/lib/permissions";

test("permission helper: admin has all, staff only granted, others none", () => {
  assert.equal(can({ role: "admin" }, "orders"), true);
  assert.equal(can({ role: "staff", permissions: ["orders"] }, "orders"), true);
  assert.equal(
    can({ role: "staff", permissions: ["orders"] }, "producers"),
    false,
  );
  assert.equal(
    can({ role: "customer", permissions: ["orders"] }, "orders"),
    false,
  );
  assert.equal(can(null, "orders"), false);
});

test(
  "isolated members: admin-only management, staff limited to granted sections, suspension logs out and blocks",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "admin" | "customer" | "producer", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const admin = mk("admin", "مدير الأعضاء"),
      member = mk("customer", "عضو سيصبح مشرفًا"),
      family = mk("producer", "صاحبة أسرة");
    const ids = [admin.id, member.id, family.id];
    const token = randomBytes(32).toString("hex");
    const asRequest = () =>
      new Request("https://test.invalid/", {
        headers: { cookie: "jdatna_session=" + token },
      });
    try {
      for (const u of [admin, member, family])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), member.id],
      );
      // إدارة الأعضاء للمدير فقط.
      await assert.rejects(listMembers(member), { status: 403 });
      assert.ok(
        (await listMembers(admin, member.phone.slice(-6))).some(
          (m) => m.id === member.id,
        ),
      );
      await assert.rejects(
        updateMember(admin, { action: "suspend", id: admin.id }),
        /حسابك/,
      );
      await assert.rejects(
        updateMember(admin, {
          action: "role",
          id: member.id,
          role: "staff",
          permissions: ["everything"],
        }),
      );
      await assert.rejects(
        updateMember(admin, { action: "role", id: family.id, role: "admin" }),
        /مراجعة الأسر/,
      );
      // ترقية العضو لمشرف بصلاحية الطلبات فقط: تُنهى جلساته ليدخل من جديد.
      await updateMember(admin, {
        action: "role",
        id: member.id,
        role: "staff",
        permissions: ["orders"],
      });
      assert.equal(await sessionUser(asRequest()), null);
      const staff = {
        ...member,
        role: "staff" as const,
        permissions: ["orders"],
      };
      await adminOrders(staff);
      await assert.rejects(adminProducers(staff), { status: 403 });
      await assert.rejects(adminCategories(staff), { status: 403 });
      await assert.rejects(
        saveCategory(
          staff,
          { name: "قسم", slug: "staff-denied", icon: "✦" },
          false,
        ),
        { status: 403 },
      );
      await assert.rejects(listMembers(staff), { status: 403 });
      // الإيقاف: يحذف الجلسات ويمنع أي جلسة لاحقة.
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), member.id],
      );
      assert.equal((await sessionUser(asRequest()))?.role, "staff");
      assert.deepEqual((await sessionUser(asRequest()))?.permissions, [
        "orders",
      ]);
      await updateMember(admin, { action: "suspend", id: member.id });
      assert.equal(await sessionUser(asRequest()), null);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.sessions WHERE user_id=$1",
            [member.id],
          )
        ).rows[0].n,
        0,
      );
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), member.id],
      );
      assert.equal(await sessionUser(asRequest()), null, "suspended stays out");
      await updateMember(admin, { action: "unsuspend", id: member.id });
      assert.equal((await sessionUser(asRequest()))?.id, member.id);
      const audits = (
        await pool.query(
          "SELECT action FROM jdatna.admin_audit_logs WHERE actor_id=$1 ORDER BY created_at",
          [admin.id],
        )
      ).rows.map((r) => r.action);
      assert.deepEqual(audits, [
        "member.role",
        "member.suspend",
        "member.unsuspend",
      ]);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.end();
    }
  },
);
