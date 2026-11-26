import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * قرار المالك 2026-11-26: أرقام الحركة أرقام فقط. «عملية» = طلب مقبول أو مكتمل؛
 * لا يُحسب المنتظر ولا المرفوض ولا الملغى ولا طلب حساب مراجعة المتجر.
 */
test(
  "order counts on family and product cards count accepted and completed orders only",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { getProducer, getProduct } = await import("../src/server/catalog");
    const { activityTotals } = await import("../src/server/activity");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const owner = randomUUID();
    const buyer = randomUUID();
    const family = randomUUID();
    const product = randomUUID();
    const idle = randomUUID();
    const slug = "activity-" + family;
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة','" +
          phone() +
          "','producer',now()),($2,'عميل','" +
          phone() +
          "','customer',now())",
        [owner, buyer],
      );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الأرقام',$4,$5,'approved')",
        [family, owner, slug, city, phone()],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$3,'كليجا','وصف','meal','available',true),($2,$3,'بلا طلبات','وصف','meal','available',true)",
        [product, idle, family],
      );
      const before = await activityTotals();
      for (const [status, hash] of [
        ["accepted", "h"],
        ["completed", "h"],
        ["completed", "h"],
        ["pending", "h"],
        ["declined", "h"],
        ["cancelled", "h"],
        ["completed", "store-review"],
      ])
        await pool.query(
          "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,$3,$4,$5,$6,'{}','عميل','+966500000000',1,'lunch',current_date,current_date,$7)",
          [randomUUID(), randomUUID(), hash, buyer, family, product, status],
        );
      assert.equal((await getProducer(slug))?.orderCount, 3);
      assert.equal((await getProduct(product))?.orderCount, 3);
      assert.equal((await getProduct(idle))?.orderCount, 0);
      const after = await activityTotals();
      // اختبارات أخرى تعمل معًا، فالمجموع لا يقل عن أثر هذه الطلبات.
      assert.ok(after.orders >= before.orders + 3);
      assert.ok(after.families >= 1 && after.products >= 1);
      for (const key of ["orders", "families", "products"] as const)
        assert.equal(typeof after[key], "number");
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
        [family],
      );
      await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        family,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [owner, buyer],
      ]);
      await pool.end();
    }
  },
);
