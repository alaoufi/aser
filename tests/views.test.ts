import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  recordView,
  recordVisit,
  familyViews,
  setViewsPublic,
  viewsAdmin,
} from "../src/server/views";
import type { SessionUser } from "../src/lib/types";

const req = (agent: string, ip = "203.0.113.70") =>
  new Request("http://localhost/api/views", {
    method: "POST",
    headers: { "user-agent": agent, "x-forwarded-for": ip },
  });
const browser = "Mozilla/5.0 (iPhone) Safari/605";

test(
  "views count once per visitor a day, skip owners and bots, and show to all only when the admin enables it",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: SessionUser["role"]): SessionUser => ({
      id: randomUUID(),
      name: role,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const owner = mk("producer"),
      admin = mk("admin"),
      visitor = mk("customer");
    const familyId = randomUUID(),
      shown = randomUUID(),
      hidden = randomUUID();
    const before = (
      await pool.query(
        "SELECT value FROM jdatna.site_settings WHERE key='views.public'",
      )
    ).rows[0]?.value;
    try {
      for (const u of [owner, admin, visitor])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المشاهدات',$4,$5,'approved')",
        [familyId, owner.id, "views-" + familyId, city, owner.phone],
      );
      await setViewsPublic(admin, { public: false });
      const view = { kind: "producer", id: familyId };
      // زائر بلا حساب: مرة واحدة في اليوم مهما أعاد الفتح، ولا يرى العدد والإعداد مغلق.
      assert.deepEqual(await recordView(req(browser), null, view), {
        visible: false,
      });
      await recordView(req(browser), null, view);
      // عنوان آخر = زائر آخر؛ صاحب الأسرة ومحركات البحث لا تُحسب.
      await recordView(req(browser, "203.0.113.71"), null, view);
      await recordView(req(browser), owner, view);
      await recordView(req("Googlebot/2.1"), null, view);
      const asAdmin = await recordView(req(browser), admin, view);
      assert.deepEqual(asAdmin, {
        views: 3,
        visible: true,
        adminOnly: true,
        productsViews: 0,
        products: {},
      });
      await assert.rejects(
        recordView(req(browser), null, { kind: "producer", id: randomUUID() }),
        { status: 404 },
      );
      // التفعيل للجميع: يراه أي زائر.
      await assert.rejects(setViewsPublic(visitor, { public: true }), {
        status: 403,
      });
      await setViewsPublic(admin, { public: true });
      const open = await recordView(req(browser), visitor, view);
      assert.deepEqual(open, {
        views: 4,
        visible: true,
        adminOnly: false,
        productsViews: 0,
        products: {},
      });
      // منتجات الأسرة: عدد كل منتج، وإجمالي منتجاتها، والمخفي يظهر للأسرة فقط.
      await pool.query(
        `INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible)
         VALUES($1,$3,'كبسة','وصف','طبق','available',true),($2,$3,'جريش','وصف','طبق','available',false)`,
        [shown, hidden, familyId],
      );
      await recordView(req(browser), null, { kind: "product", id: shown });
      await recordView(req(browser, "203.0.113.73"), null, {
        kind: "product",
        id: shown,
      });
      await pool.query(
        "INSERT INTO jdatna.view_counts(kind,target_id,views) VALUES('product',$1,5)",
        [hidden],
      );
      const page = await recordView(req(browser), visitor, view);
      assert.deepEqual(page.visible && [page.productsViews, page.products], [
        2,
        { [shown]: 2 },
      ]);
      const mine = await familyViews(owner);
      assert.equal(mine.pageViews, 4);
      assert.equal(mine.productsViews, 7);
      assert.deepEqual(
        mine.products.map((p) => [p.id, p.views, p.visible]),
        [
          [hidden, 5, false],
          [shown, 2, true],
        ],
      );
      await assert.rejects(familyViews(visitor), { status: 404 });
      assert.ok(
        (await viewsAdmin(admin)).producers.some(
          (p) => p.id === familyId && p.views === 4,
        ),
      );
      // زوار الموقع: اليوم والإجمالي والمتواجدون الآن.
      const visit = await recordVisit(req(browser, "203.0.113.72"), null);
      assert.equal(visit.visible, true);
      if (visit.visible) {
        assert.ok(visit.today >= 1 && visit.total >= visit.today);
        assert.ok(visit.online >= 1);
      }
      await setViewsPublic(admin, { public: false });
      assert.deepEqual(await recordVisit(req(browser), null), {
        visible: false,
      });
    } finally {
      await pool.query(
        "UPDATE jdatna.site_settings SET value=$1 WHERE key='views.public'",
        [before ?? "off"],
      );
      await pool.query(
        "DELETE FROM jdatna.view_counts WHERE target_id=ANY($1)",
        [[familyId, shown, hidden]],
      );
      await pool.query("DELETE FROM jdatna.view_seen WHERE target_id=ANY($1)", [
        [familyId, shown, hidden],
      ]);
      await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1)", [
        [shown, hidden],
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query(
        "DELETE FROM jdatna.site_settings WHERE updated_by=$1 AND key<>'views.public'",
        [admin.id],
      );
      await pool.query(
        "UPDATE jdatna.site_settings SET updated_by=NULL WHERE updated_by=$1",
        [admin.id],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [
        [owner.id, admin.id, visitor.id],
      ]);
    }
  },
);
