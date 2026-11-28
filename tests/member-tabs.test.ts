import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * تبويبات «الأعضاء والصلاحيات» (قرار المالك 2026-11-28): الكل، المسجلون خلال 24 ساعة، الموقوفون،
 * الأسر المنتجة، العملاء، الإدارة — كل تبويب بشرطه في الخادم، وعدده.
 */
test(
  "member tabs list exactly their members and count them",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { listMembers, memberTabCounts } =
      await import("../src/server/members");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = "تبويب" + randomUUID().slice(0, 6);
    const ids: string[] = [];
    const family = randomUUID();
    const mk = async (
      role: string,
      extra: {
        old?: boolean;
        suspended?: boolean;
        permissions?: string[];
      } = {},
    ) => {
      const id = randomUUID();
      ids.push(id);
      await pool.query(
        `INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at,created_at,suspended_at,permissions)
         VALUES($1,$2,$3,$4,now(),now()-$5::interval,$6,$7)`,
        [
          id,
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
          `${tag} ${role}`,
          role,
          extra.old ? "3 days" : "1 hour",
          extra.suspended ? new Date() : null,
          extra.permissions ?? [],
        ],
      );
      return id;
    };
    try {
      const admin = await mk("admin", { old: true });
      const staff = await mk("customer", {
        old: true,
        permissions: ["orders"],
      });
      const fresh = await mk("customer");
      const oldCustomer = await mk("customer", { old: true });
      const stopped = await mk("customer", { old: true, suspended: true });
      const owner = await mk("producer", { old: true });
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة التبويب',$4,'+966500000077','approved')",
        [family, owner, "tabs-" + family, city],
      );
      const me = { id: admin, role: "admin" } as never;
      const tabIds = async (tab: string) =>
        (await listMembers(me, tag, tab)).map((m) => m.id).sort();
      assert.deepEqual(await tabIds("all"), [...ids].sort());
      assert.deepEqual(await tabIds("new"), [fresh]);
      assert.deepEqual(await tabIds("suspended"), [stopped]);
      assert.deepEqual(await tabIds("families"), [owner]);
      assert.deepEqual(
        await tabIds("customers"),
        [fresh, oldCustomer, stopped].sort(),
      );
      assert.deepEqual(await tabIds("admins"), [admin, staff].sort());
      // تبويب غير معروف = الكل.
      assert.deepEqual(await tabIds("x"), [...ids].sort());
      const counts = await memberTabCounts(me);
      for (const k of ["all", "new", "suspended", "families", "customers"])
        assert.ok((counts as Record<string, number>)[k] >= 1, k);
      // غير المدير لا يرى.
      await assert.rejects(
        listMembers({ id: fresh, role: "customer" } as never, "", "all"),
        { status: 403 },
      );
    } finally {
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
    }
  },
);
