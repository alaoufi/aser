import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  NAV_GROUPS,
  applyMenuOrder,
  cleanMenuOrder,
  visibleGroups,
} from "../src/lib/admin-nav";

/**
 * ترتيب القائمة الجانبية لكل مدير بالسحب والإفلات (طلب المالك 2026-11-28):
 * للعرض فقط؛ لا يُظهر ما ليس من الصلاحيات ولا ما أخفاه «ترتيب القوائم» العام.
 */
test("a personal order reorders groups and pages but never shows what is not allowed", () => {
  const groups = NAV_GROUPS.map((g) => g.label);
  const last = groups.at(-1)!;
  const people = NAV_GROUPS.find((g) =>
    g.items.some((it) => it.to === "/admin/producers"),
  )!;
  const order = cleanMenuOrder({
    groups: [last, people.label],
    items: { [people.label]: ["/admin/members", "/admin/producers"] },
  });
  assert.ok(order);
  const admin = { role: "admin", permissions: [] };
  const shown = visibleGroups(admin, null, order);
  assert.equal(shown[0].label, last);
  assert.equal(shown[1].label, people.label);
  assert.deepEqual(
    shown[1].items.slice(0, 2).map((it) => it.to),
    ["/admin/members", "/admin/producers"],
  );
  // ما لم يُذكر يبقى بعده بترتيبه.
  assert.equal(shown.length, NAV_GROUPS.length);
  // مدير مخصص بصلاحية «الطلبات» فقط: الترتيب لا يُظهر له غيرها.
  const staff = { role: "customer", permissions: ["orders"] };
  const mine = visibleGroups(staff, null, order);
  assert.deepEqual(
    mine.flatMap((g) => g.items.map((it) => it.to)).sort(),
    ["/admin", "/admin/orders"].sort(),
  );
  // ما أخفاه «ترتيب القوائم» العام يبقى مخفيًا.
  const hidden = visibleGroups(
    admin,
    {
      groups: NAV_GROUPS.map((g) => ({
        key: g.label,
        title: null,
        items: g.items.map((it) => it.to),
      })),
      hidden: ["/admin/views"],
    },
    cleanMenuOrder({ groups: [], items: {} }),
  );
  assert.ok(
    !hidden.some((g) => g.items.some((it) => it.to === "/admin/views")),
  );
  // ترتيب غير صالح يُرفض.
  assert.equal(cleanMenuOrder({ groups: "x" }), null);
  assert.equal(
    cleanMenuOrder({ groups: ["a"], items: { a: ["https://evil"] } }),
    null,
  );
  assert.equal(
    cleanMenuOrder({ groups: ["a"], items: { b: ["/admin/orders"] } }),
    null,
  );
  assert.deepEqual(applyMenuOrder([{ key: "x", items: [] }], null), [
    { key: "x", items: [] },
  ]);
});

test(
  "each manager's order is saved in the database, survives reloads, and resets to the default",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { getMenuOrder, saveMenuOrder } =
      await import("../src/server/menu-layout");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const mk = async (role: string, permissions: string[] = []) => {
      const u = {
        id: randomUUID(),
        name: role,
        phone:
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        role,
        permissions,
      };
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.phone, u.name, u.role],
      );
      return u as unknown as import("../src/lib/types").SessionUser;
    };
    const a = await mk("admin");
    const b = await mk("admin");
    const member = await mk("customer");
    try {
      const order = {
        groups: [NAV_GROUPS[1].label, NAV_GROUPS[0].label],
        items: {},
      };
      await saveMenuOrder(a, order);
      assert.deepEqual(await getMenuOrder(a), order);
      // لكل مدير ترتيبه.
      assert.equal(await getMenuOrder(b), null);
      // غير الإداري لا يحفظ.
      await assert.rejects(saveMenuOrder(member, order), { status: 403 });
      await assert.rejects(saveMenuOrder(a, { groups: 5 }), { status: 400 });
      // الاستعادة تعيد الافتراضي.
      await saveMenuOrder(a, { reset: true });
      assert.equal(await getMenuOrder(a), null);
    } finally {
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [a.id, b.id, member.id],
      ]);
    }
  },
);
