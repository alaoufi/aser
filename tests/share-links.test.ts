import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { resolveShare, shareCode, shortLink } from "../src/server/share";

test(
  "isolated short share links: stable code per product and family, redirect only while public",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const user = randomUUID(),
      fam = randomUUID(),
      product = randomUUID(),
      hidden = randomUUID();
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة المشاركة',$2,'producer',now())",
        [user, phone],
      );
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المشاركة',$4,$5,'approved')",
        [fam, user, "share-" + fam, city, phone],
      );
      for (const [id, visible] of [
        [product, true],
        [hidden, false],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,visible) VALUES($1,$2,'جريش المشاركة','وصف',20,'صحن','available',$3)",
          [id, fam, visible],
        );

      // رمز قصير بحروف واضحة، وثابت لنفس المنتج، ومختلف للأسرة.
      const code = await shareCode("product", product);
      assert.match(code, /^[2-9a-km-zA-HJ-NP-Z]{6}$/);
      assert.equal(await shareCode("product", product), code);
      const [a, b] = await Promise.all([
        shareCode("family", fam),
        shareCode("family", fam),
      ]);
      assert.equal(a, b, "طلبان معًا يعطيان نفس الرمز");
      assert.notEqual(a, code);
      assert.equal(
        await shortLink("product", product),
        "https://jdtna.sa/s/" + code,
      );

      // التحويل إلى الصفحة الأصلية.
      assert.equal(await resolveShare(code), "/products/" + product);
      assert.equal(await resolveShare(a), "/producers/share-" + fam);
      assert.equal(await resolveShare("zzzzzz"), null);
      assert.equal(await resolveShare("../etc"), null);

      // المخفي وغير الموجود لا يُشارك، وإخفاء المنتج لاحقًا يوقف رابطه.
      await assert.rejects(shareCode("product", hidden), { status: 404 });
      await assert.rejects(shareCode("product", randomUUID()), {
        status: 404,
      });
      assert.equal(await shortLink("product", hidden), null);
      await pool.query("UPDATE jdatna.products SET visible=false WHERE id=$1", [
        product,
      ]);
      assert.equal(await resolveShare(code), null);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='suspended' WHERE id=$1",
        [fam],
      );
      assert.equal(await resolveShare(a), null);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.share_links WHERE target_id=ANY($1::uuid[])",
        [[product, hidden, fam]],
      );
      await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
        fam,
      ]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        fam,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user]);
    }
  },
);
