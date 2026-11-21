import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  NAV_GROUPS,
  applyMenuLayout,
  cleanMenuLayout,
  toLayout,
  visibleGroups,
} from "../src/lib/admin-nav";

/** «ترتيب القوائم» (من «أي خدمة»، AYK-410): ما يُقبل حفظه، وكيف يُطبَّق على القائمة. */
test("a good layout is kept; the dashboard and this page cannot be hidden", () => {
  const out = cleanMenuLayout({
    groups: [
      { key: "نظرة عامة", title: " عام ", items: ["/admin", "/admin/views"] },
    ],
    hidden: ["/admin", "/admin/menu-layout", "/admin/views"],
  });
  assert.deepEqual(out, {
    groups: [
      { key: "نظرة عامة", title: "عام", items: ["/admin", "/admin/views"] },
    ],
    hidden: ["/admin/views"],
  });
});

test("bad layouts are refused", () => {
  assert.equal(cleanMenuLayout(null), null);
  assert.equal(
    cleanMenuLayout({
      groups: [{ key: "x", items: ["/admin/a", "/admin/a"] }],
    }),
    null,
    "a page twice",
  );
  assert.equal(
    cleanMenuLayout({
      groups: [{ key: "x", items: ["https://evil.example"] }],
    }),
    null,
    "not an admin page",
  );
  assert.equal(
    cleanMenuLayout({ groups: [{ key: "x", items: ["/admin/<script>"] }] }),
    null,
    "not a plain path",
  );
  assert.equal(cleanMenuLayout({ groups: [{ key: "", items: [] }] }), null);
  assert.equal(
    cleanMenuLayout({
      groups: Array.from({ length: 21 }, (_, i) => ({
        key: `g${i}`,
        items: [],
      })),
    }),
    null,
    "too many groups",
  );
});

test("the saved order moves groups and pages, hides pages, and never loses a new page", () => {
  const all = NAV_GROUPS.flatMap((g) => g.items.map((it) => it.to));
  // بلا ترتيب محفوظ: القائمة الأصلية كما هي.
  assert.deepEqual(
    applyMenuLayout(NAV_GROUPS, null).map((g) => g.key),
    NAV_GROUPS.map((g) => g.label),
  );
  // «التقارير» أولًا باسم جديد، و«الطلبات» تنتقل إليها، و«الاقتراحات» مخفية.
  // باقي المجموعات والصفحات لم تُذكر (كأنها أُضيفت بعد الحفظ): تبقى في مجموعاتها الأصلية.
  const laid = applyMenuLayout(NAV_GROUPS, {
    groups: [
      {
        key: "التقارير",
        title: "تقارير ومتابعة",
        items: ["/admin/orders", "/admin/security"],
      },
      { key: "نظرة عامة", title: null, items: ["/admin"] },
    ],
    hidden: ["/admin/suggestions"],
  });
  assert.equal(laid[0].title, "تقارير ومتابعة");
  assert.deepEqual(
    laid[0].items.map((it) => it.to),
    // «سجل النشاطات» أُضيف بعد حفظ الترتيب: يظهر وحده في مجموعته الأصلية.
    ["/admin/orders", "/admin/security", "/admin/backups", "/admin/activity"],
  );
  assert.deepEqual(
    laid[1].items.map((it) => it.to),
    ["/admin", "/admin/views"],
  );
  // المجموعات التي لا يعرفها الترتيب تظهر كاملة بعده، بترتيبها الأصلي.
  assert.deepEqual(
    laid.slice(2).map((g) => g.key),
    NAV_GROUPS.map((g) => g.label).filter(
      (l) => !["التقارير", "نظرة عامة"].includes(l),
    ),
  );
  const shown = laid.flatMap((g) => g.items.map((it) => it.to));
  assert.ok(!shown.includes("/admin/suggestions"), "hidden page left out");
  assert.deepEqual(
    [...shown, "/admin/suggestions"].sort(),
    [...all].sort(),
    "every other page still appears once",
  );
  // الترتيب يُحفظ ويُقرأ كما هو.
  const saved = toLayout(laid, ["/admin/suggestions"]);
  assert.deepEqual(cleanMenuLayout(saved), saved);
  // المشرف يرى ما يحق له فقط، بالترتيب المحفوظ.
  const staff = visibleGroups(
    { role: "customer", permissions: ["orders"] },
    saved,
  );
  assert.deepEqual(
    staff.map((g) => g.items.map((it) => it.to)),
    [["/admin/orders"], ["/admin"], ["/admin/contracts"]],
  );
});

test(
  "only the full admin saves the order; every manager reads it; reset restores the default",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { getMenuLayout, saveMenuLayout } =
      await import("../src/server/menu-layout");
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const admin = {
      id: randomUUID(),
      name: "مدير",
      phone: "+966500000001",
      role: "admin" as const,
    };
    const staff = {
      ...admin,
      id: randomUUID(),
      role: "customer" as const,
      permissions: ["orders"],
    };
    const customer = { ...staff, permissions: [] };
    const prior = (
      await pool.query(
        "SELECT value FROM jdatna.site_settings WHERE key='admin:menu-layout'",
      )
    ).rows[0]?.value as string | undefined;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'مدير اختبار',$2,'admin',now())",
      [
        admin.id,
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      ],
    );
    try {
      const layout = {
        groups: [
          { key: "التقارير", title: "تقارير", items: ["/admin/security"] },
        ],
        hidden: ["/admin/views"],
      };
      await assert.rejects(saveMenuLayout(staff, layout), { status: 403 });
      await assert.rejects(saveMenuLayout(admin, { groups: "x" }), {
        status: 400,
      });
      await saveMenuLayout(admin, layout);
      assert.deepEqual(await getMenuLayout(staff), layout);
      await assert.rejects(getMenuLayout(customer), { status: 403 });
      const audit = (
        await pool.query(
          "SELECT count(*)::int AS n FROM jdatna.admin_audit_logs WHERE actor_id=$1 AND action='admin.menu-layout'",
          [admin.id],
        )
      ).rows[0].n;
      assert.equal(audit, 1);
      await saveMenuLayout(admin, { reset: true });
      assert.equal(await getMenuLayout(admin), null);
    } finally {
      if (prior !== undefined)
        await pool.query(
          "INSERT INTO jdatna.site_settings(key,value,updated_at) VALUES('admin:menu-layout',$1,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
          [prior],
        );
      else
        await pool.query(
          "DELETE FROM jdatna.site_settings WHERE key='admin:menu-layout'",
        );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query("DELETE FROM jdatna.site_settings WHERE updated_by=$1", [
        admin.id,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [admin.id]);
      await pool.end();
    }
  },
);
