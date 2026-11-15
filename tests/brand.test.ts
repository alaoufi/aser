import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { ownBrand, saveBrand } from "../src/server/brand";
import { getProduct, getProducer } from "../src/server/catalog";
import { brandPalettes, paletteFor } from "../src/lib/brand";
import type { SessionUser } from "../src/lib/types";

test("brand palette falls back to a stable colour and never to white", () => {
  const a = paletteFor("00000000-0000-4000-8000-000000000001");
  assert.equal(paletteFor("00000000-0000-4000-8000-000000000001").id, a.id);
  assert.equal(paletteFor("x", "basil").id, "basil");
  assert.equal(paletteFor("x", "unknown").id, paletteFor("x").id);
  for (const p of brandPalettes) assert.notEqual(p.bg.toLowerCase(), "#fff");
});

test(
  "isolated family brand: the family picks a colour and its card and products carry it",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const user: SessionUser = {
      id: randomUUID(),
      name: "أسرة الهوية",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer",
    };
    const stranger: SessionUser = {
      ...user,
      id: randomUUID(),
      role: "customer",
    };
    const familyId = randomUUID(),
      productId = randomUUID();
    const slug = "brand-" + familyId;
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
        [user.id, user.name, user.phone],
      );
      const city = (
        await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الهوية',$4,$5,'approved')",
        [familyId, user.id, slug, city, user.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق الهوية','وصف','meal','unavailable',true)",
        [productId, familyId],
      );
      // قبل الاختيار: لون افتراضي ثابت.
      const before = await ownBrand(user);
      assert.equal(before.chosen, false);
      assert.equal(before.palette, paletteFor(familyId).id);
      assert.equal(before.tier, "free");
      // لون غير موجود مرفوض، ومن لا ملف له لا يختار.
      await assert.rejects(saveBrand(user, { palette: "neon" }));
      await assert.rejects(saveBrand(stranger, { palette: "sea" }), {
        status: 404,
      });
      const after = await saveBrand(user, { palette: "pomegranate" });
      assert.equal(after.palette, "pomegranate");
      assert.equal(after.chosen, true);
      // بطاقة الأسرة ومنتجاتها تأخذ نفس الهوية.
      assert.equal((await getProducer(slug))?.palette, "pomegranate");
      assert.equal((await getProduct(productId))?.palette, "pomegranate");
      await saveBrand(user, { palette: "sea" });
      assert.equal((await getProduct(productId))?.palette, "sea");
    } finally {
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user.id]);
    }
  },
);
