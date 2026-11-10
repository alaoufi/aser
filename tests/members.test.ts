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
import { can, isManager } from "../src/lib/permissions";

test("admin permissions are independent of the account type", () => {
  assert.equal(can({ role: "admin" }, "orders"), true);
  assert.equal(
    can({ role: "customer", permissions: ["orders"] }, "orders"),
    true,
  );
  assert.equal(
    can({ role: "producer", permissions: ["reports"] }, "reports"),
    true,
  );
  assert.equal(
    can({ role: "customer", permissions: ["orders"] }, "producers"),
    false,
  );
  assert.equal(can({ role: "customer", permissions: [] }, "orders"), false);
  assert.equal(can(null, "orders"), false);
  assert.equal(isManager({ role: "producer", permissions: ["reports"] }), true);
  assert.equal(isManager({ role: "producer", permissions: [] }), false);
});

test(
  "isolated members: admin adds members and grants permissions to any account, limited to granted sections, suspension logs out",
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
      member = mk("customer", "عضو يُعطى صلاحيات"),
      family = mk("producer", "صاحبة أسرة");
    const ids: string[] = [admin.id, member.id, family.id];
    const token = randomBytes(32).toString("hex");
    const asRequest = () =>
      new Request("https://test.invalid/", {
        headers: { cookie: "jdatna_session=" + token },
      });
    const session = () =>
      pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), member.id],
      );
    try {
      for (const u of [admin, member, family])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      await session();
      // إدارة الأعضاء للمدير الكامل فقط.
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
          action: "access",
          id: member.id,
          permissions: ["everything"],
        }),
      );
      // الأسرة المنتجة تُعطى صلاحيات محددة وتبقى أسرة، ولا تصبح مديرًا كاملًا.
      await assert.rejects(
        updateMember(admin, {
          action: "access",
          id: family.id,
          fullAdmin: true,
        }),
        /صلاحيات محددة/,
      );
      await updateMember(admin, {
        action: "access",
        id: family.id,
        permissions: ["reports"],
      });
      assert.deepEqual(
        (
          await pool.query(
            "SELECT role,permissions FROM jdatna.users WHERE id=$1",
            [family.id],
          )
        ).rows[0],
        { role: "producer", permissions: ["reports"] },
      );
      // العضو يُعطى صلاحية الطلبات فقط ويبقى عميلًا؛ تُنهى جلساته ليدخل من جديد.
      await updateMember(admin, {
        action: "access",
        id: member.id,
        permissions: ["orders"],
      });
      assert.equal(await sessionUser(asRequest()), null);
      const granted = {
        ...member,
        role: "customer" as const,
        permissions: ["orders"],
      };
      await adminOrders(granted);
      await assert.rejects(adminProducers(granted), { status: 403 });
      await assert.rejects(adminCategories(granted), { status: 403 });
      await assert.rejects(
        saveCategory(
          granted,
          { name: "قسم", slug: "granted-denied", icon: "✦" },
          false,
        ),
        { status: 403 },
      );
      await assert.rejects(listMembers(granted), { status: 403 });
      await session();
      const seen = await sessionUser(asRequest());
      assert.equal(seen?.role, "customer");
      assert.deepEqual(seen?.permissions, ["orders"]);
      // الإيقاف: يحذف الجلسات ويمنع أي جلسة لاحقة.
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
      await session();
      assert.equal(await sessionUser(asRequest()), null, "suspended stays out");
      await updateMember(admin, { action: "unsuspend", id: member.id });
      assert.equal((await sessionUser(asRequest()))?.id, member.id);
      // إضافة عضو جديد برقم جواله مع صلاحياته؛ الرقم المكرر يُرفض.
      const added = (await updateMember(admin, {
        action: "create",
        name: "مشرفة جديدة",
        phone: "05" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        permissions: ["content"],
      })) as unknown as { id: string };
      ids.push(added.id);
      const created = (
        await pool.query(
          "SELECT role,permissions,phone FROM jdatna.users WHERE id=$1",
          [added.id],
        )
      ).rows[0];
      assert.equal(created.role, "customer");
      assert.deepEqual(created.permissions, ["content"]);
      await assert.rejects(
        updateMember(admin, {
          action: "create",
          name: "مكرر",
          phone: created.phone,
        }),
        { status: 409 },
      );
      const audits = (
        await pool.query(
          "SELECT action FROM jdatna.admin_audit_logs WHERE actor_id=$1 ORDER BY created_at",
          [admin.id],
        )
      ).rows.map((r) => r.action);
      assert.deepEqual(audits, [
        "member.access",
        "member.access",
        "member.suspend",
        "member.unsuspend",
        "member.create",
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
