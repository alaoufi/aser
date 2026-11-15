import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { ownBrand, saveBrand, saveCategoryFrame } from "../src/server/brand";
import { getCategories, getProduct, getProducer } from "../src/server/catalog";
import {
  brandPalettes,
  frameFor,
  identityCount,
  identityProps,
  isPremium,
  patternUrl,
  resolveBrand,
} from "../src/lib/brand";
import type { SessionUser } from "../src/lib/types";

test("identity library: thousands of combinations, stable defaults from the free library", () => {
  assert.ok(identityCount.family >= 4000);
  assert.ok(identityCount.product >= 50000);
  const seed = "00000000-0000-4000-8000-000000000001";
  const a = resolveBrand(seed);
  assert.deepEqual(resolveBrand(seed), a);
  // الافتراضي لا يمنح شيئًا من المكتبة المميزة.
  for (let i = 0; i < 300; i++) {
    const b = resolveBrand(randomUUID());
    assert.equal(
      isPremium({
        palette: b.palette.id,
        pattern: b.pattern.id,
        effect: b.effect.id,
      }),
      false,
    );
  }
  for (const p of brandPalettes) assert.notEqual(p.bg.toLowerCase(), "#fff");
  // المنتج يدمج الهويتين: صنف تأثير الأسرة وصنف إطار القسم معًا.
  const id = identityProps(
    seed,
    { palette: "sea", effect: "raised" },
    { chosen: "arch" },
  );
  assert.match(id.className, /\bfx-raised\b/);
  assert.match(id.className, /\bframe-arch\b/);
  assert.equal(frameFor("5").id, frameFor("5").id);
  assert.equal(patternUrl("plain", "#000"), "none");
  assert.match(patternUrl("najmah", "#2f5f7a"), /^url\("data:image\/svg\+xml,/);
});

test(
  "isolated family and category identity: family picks its identity, premium is locked, products merge both",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const user: SessionUser = {
      id: randomUUID(),
      name: "أسرة الهوية",
      phone: phone(),
      role: "producer",
    };
    const stranger: SessionUser = {
      id: randomUUID(),
      name: "عميل",
      phone: phone(),
      role: "customer",
    };
    const admin: SessionUser = {
      id: randomUUID(),
      name: "مدير",
      phone: phone(),
      role: "admin",
    };
    const familyId = randomUUID(),
      productId = randomUUID();
    const slug = "brand-" + familyId;
    let categoryId = "";
    let priorFrame: string | null = null;
    try {
      for (const u of [user, stranger, admin])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (
        await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
      ).rows[0].id;
      categoryId = (
        await pool.query("SELECT id FROM jdatna.categories ORDER BY id LIMIT 1")
      ).rows[0].id;
      priorFrame =
        (
          await pool.query(
            "SELECT frame FROM jdatna.category_identity WHERE category_id=$1",
            [categoryId],
          )
        ).rows[0]?.frame ?? null;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الهوية',$4,$5,'approved')",
        [familyId, user.id, slug, city, user.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق الهوية','وصف','meal','unavailable',true)",
        [productId, familyId],
      );
      await pool.query(
        "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
        [productId, categoryId],
      );
      const before = await ownBrand(user);
      assert.equal(before.chosen, false);
      assert.equal(before.tier, "free");
      const choice = {
        palette: "pomegranate",
        pattern: "najmah",
        effect: "raised",
        scale: 2,
      };
      // غير موجود مرفوض، والمميز مقفل للمجاني، ومن لا ملف له لا يختار.
      await assert.rejects(saveBrand(user, { ...choice, pattern: "neon" }));
      await assert.rejects(saveBrand(user, { ...choice, pattern: "girih" }), {
        status: 402,
      });
      await assert.rejects(saveBrand(user, { ...choice, effect: "gold" }), {
        status: 402,
      });
      await assert.rejects(saveBrand(stranger, choice), { status: 404 });
      const after = await saveBrand(user, choice);
      assert.equal(after.pattern, "najmah");
      assert.equal(after.chosen, true);
      assert.deepEqual((await getProducer(slug))?.brand, choice);
      // المنتج يأخذ هوية أسرته، وإطار قسمه.
      await assert.rejects(
        saveCategoryFrame(user, { id: categoryId, frame: "arch" }),
        { status: 403 },
      );
      await saveCategoryFrame(admin, { id: categoryId, frame: "arch" });
      const product = await getProduct(productId);
      assert.deepEqual(product?.brand, choice);
      assert.equal(product?.primaryCategory, categoryId);
      assert.equal(product?.frame, "arch");
      assert.equal(
        (await getCategories(true)).find((c) => c.id === categoryId)?.frame,
        "arch",
      );
      // الهوية المدفوعة تفتح المكتبة المميزة.
      await pool.query(
        "UPDATE jdatna.producer_brand SET tier='pro' WHERE producer_id=$1",
        [familyId],
      );
      assert.equal(
        (await saveBrand(user, { ...choice, pattern: "girih" })).pattern,
        "girih",
      );
    } finally {
      if (categoryId) {
        await pool.query(
          "DELETE FROM jdatna.category_identity WHERE category_id=$1",
          [categoryId],
        );
        if (priorFrame)
          await pool.query(
            "INSERT INTO jdatna.category_identity(category_id,frame) VALUES($1,$2)",
            [categoryId, priorFrame],
          );
      }
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=$1",
        [productId],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [user.id, stranger.id, admin.id],
      ]);
    }
  },
);
