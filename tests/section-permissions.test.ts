import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SessionUser } from "../src/lib/types";
import { ADMIN_PERMISSION_IDS, can, canAny } from "../src/lib/permissions";
import { NAV_GROUPS } from "../src/lib/admin-nav";

/**
 * صلاحيات بالأقسام (قرار المالك 2026-11-22): «مدير عام» له كل شيء، و«مدير مخصص» ما اختير له من أقسام
 * القائمة الجانبية فقط. الخادم يفرضها قسمًا قسمًا، والمشرفون الحاليون حُوّلوا لما يكافئ مجموعاتهم القديمة.
 */
test("every sidebar section (but the dashboard and members) is its own permission", () => {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  for (const it of items) {
    if (it.to === "/admin") assert.equal(it.perm, null);
    else if (it.to === "/admin/members") assert.equal(it.perm, "owner");
    else assert.equal(it.perm, it.to.split("/").at(-1), it.to);
  }
  const perms = items.map((i) => i.perm).filter((p) => p && p !== "owner");
  assert.deepEqual([...perms].sort(), [...ADMIN_PERMISSION_IDS].sort());
  const staff = { role: "customer", permissions: ["approvals"] };
  assert.equal(can(staff, "approvals"), true);
  assert.equal(can(staff, "producers"), false);
  assert.equal(canAny(staff, "orders", "approvals"), true);
  assert.equal(can({ role: "admin", permissions: [] }, "backups"), true);
});

test("the migration maps each old group to exactly its sections", () => {
  const sql = readFileSync("migrations/061_section_permissions.sql", "utf8");
  for (const [old, sections] of [
    ["producers", "'approvals','producers'"],
    ["orders", "'orders','contracts'"],
    ["categories", "'categories','product-fields'"],
    ["locations", "'locations','coverage'"],
    ["reports", "'reports','deleted-chats'"],
    ["content", "'template','texts','app','views'"],
  ])
    assert.ok(sql.includes(`WHEN '${old}' THEN ARRAY[${sections}]`), old);
});

test(
  "a specialized admin opens only the sections given, everything else is refused on the server",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (permissions: string[]) =>
      ({
        id: randomUUID(),
        name: "مخصص",
        phone:
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        role: "customer",
        permissions,
      }) as SessionUser;
    const approvals = mk(["approvals"]);
    const contracts = mk(["contracts"]);
    const { adminProducers } = await import("../src/server/management");
    const { adminOrders, adminSummary } = await import("../src/server/admin");
    const { adminContracts } = await import("../src/server/subscriptions");
    const { backupReport } = await import("../src/server/backups");
    const { activityLog } = await import("../src/server/activity-log");
    const { integrations } = await import("../src/server/integrations");
    const { adminSiteTexts } = await import("../src/server/settings");
    const { adminSuggestions } = await import("../src/server/suggestions");
    const { adminAds } = await import("../src/server/ads");
    const { getMenuLayout, saveMenuLayout } =
      await import("../src/server/menu-layout");
    try {
      // المسموح له: قسمه، ولوحة التحكم، وقراءة ترتيب القائمة.
      assert.ok(Array.isArray(await adminProducers(approvals)));
      await adminSummary(approvals);
      await getMenuLayout(approvals);
      assert.ok(Array.isArray(await adminContracts(contracts)));
      // وكل ما سواه مرفوض.
      for (const [name, call] of [
        ["orders", () => adminOrders(approvals)],
        ["contracts", () => adminContracts(approvals)],
        ["approvals", () => adminProducers(contracts)],
        ["backups", () => backupReport(approvals)],
        ["activity", () => activityLog(approvals, {})],
        ["integrations", () => integrations(approvals)],
        ["texts", () => adminSiteTexts(approvals)],
        ["suggestions", () => adminSuggestions(approvals)],
        ["ads", () => adminAds(approvals)],
        ["menu-layout", () => saveMenuLayout(approvals, { reset: true })],
      ] as const)
        await assert.rejects(call(), { status: 403 }, name);
    } finally {
      await pool.end();
    }
  },
);
