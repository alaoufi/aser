import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * قائمة ⋮ في «الأسر المنتجة» (قرار المالك 2026-11-28): توثيق يدوي مستقل، وإخفاء عن الزوار
 * (الأسرة ومنتجاتها) مع بقائها عند الإدارة، وإظهار يعيدها كما كانت. والأسرة تبقى مخفية وهي تُصلح بياناتها.
 */
test(
  "admins verify, hide and show a family; a hidden family disappears from visitors only",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const push = await import("../src/server/push");
    const m = await import("../src/server/management");
    const catalog = await import("../src/server/catalog");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    push.setPushTransport(async () => {});
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = async (role: string) => {
      const u = { id: randomUUID(), name: role, phone: phone(), role };
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.phone, u.name, u.role],
      );
      return u as unknown as import("../src/lib/types").SessionUser;
    };
    const admin = await mk("admin");
    const owner = await mk("producer");
    const stranger = await mk("customer");
    const family = randomUUID();
    const product = randomUUID();
    const slug = "hide-" + family;
    try {
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الإخفاء',$4,$5,'approved')",
        [family, owner.id, slug, city, owner.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق الإخفاء','وصف','صحن','available',true)",
        [product, family],
      );
      // غير المخوّل لا يقرر.
      await assert.rejects(
        m.familyAdminAction(stranger, family, { action: "verify" }),
        { status: 403 },
      );
      // التوثيق اليدوي يظهر في صفحة الأسرة.
      const verified = await m.familyAdminAction(admin, family, {
        action: "verify",
      });
      assert.ok(verified.adminVerifiedAt);
      assert.equal((await catalog.getProducer(slug))?.adminVerified, true);
      // الإخفاء يحتاج سببًا، ويخفي الأسرة ومنتجاتها عن الزوار.
      await assert.rejects(
        m.familyAdminAction(admin, family, { action: "hide", reason: "" }),
      );
      const hidden = await m.familyAdminAction(admin, family, {
        action: "hide",
        reason: "صور المنتجات غير واضحة",
      });
      assert.equal(hidden.status, "hidden");
      assert.equal(await catalog.getProducer(slug), null);
      assert.equal(await catalog.getProduct(product), null);
      // تبقى في قائمة الإدارة بحالتها.
      const listed = (await m.adminProducers(admin)).find(
        (x: { id: string }) => x.id === family,
      ) as { status: string; hiddenReason: string } | undefined;
      assert.equal(listed?.status, "hidden");
      assert.equal(listed?.hiddenReason, "صور المنتجات غير واضحة");
      // الأسرة تعرف السبب.
      const note = (
        await pool.query(
          "SELECT body FROM jdatna.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
          [owner.id],
        )
      ).rows[0];
      assert.match(note.body, /صور المنتجات غير واضحة/);
      // لا توثيق ولا إخفاء ثانٍ وهي مخفية.
      await assert.rejects(
        m.familyAdminAction(admin, family, { action: "verify" }),
        { status: 409 },
      );
      // الإظهار يعيدها كما كانت (وتبقى موثّقة).
      const shown = await m.familyAdminAction(admin, family, {
        action: "unhide",
      });
      assert.equal(shown.status, "approved");
      assert.equal((await catalog.getProducer(slug))?.adminVerified, true);
      assert.ok(await catalog.getProduct(product));
      await m.familyAdminAction(admin, family, { action: "unverify" });
      assert.equal((await catalog.getProducer(slug))?.adminVerified, false);
    } finally {
      await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
        family,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE target_id=$1",
        [family],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        family,
      ]);
      await pool.query(
        "DELETE FROM jdatna.notifications WHERE user_id=ANY($1::uuid[])",
        [[admin.id, owner.id, stranger.id]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [admin.id, owner.id, stranger.id],
      ]);
    }
  },
);
