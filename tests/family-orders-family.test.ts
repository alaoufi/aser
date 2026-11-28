import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  memberOrders,
  producerOrders,
  submitOrder,
} from "../src/server/orders";
import type { SessionUser } from "../src/lib/types";

test(
  "a producer family orders a product from another family like any customer, but not from itself",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (name: string): SessionUser => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer",
    });
    const buyer = mk("أسرة تطلب"),
      seller = mk("أسرة تبيع");
    const buyerFamily = randomUUID(),
      sellerFamily = randomUUID(),
      sellerProduct = randomUUID(),
      buyerProduct = randomUUID();
    try {
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      for (const [u, f, p] of [
        [buyer, buyerFamily, buyerProduct],
        [seller, sellerFamily, sellerProduct],
      ] as const) {
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
          [u.id, u.name, u.phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,pickup,pickup_location) VALUES($1,$2,$3,$4,$5,$6,'approved',true,'حي النخيل، شارع 1')",
          [f, u.id, "ff-" + f.slice(0, 8), u.name, city, u.phone],
        );
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'جريش','وصف',20,'طبق','available')",
          [p, f],
        );
      }
      const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
      const order = (productId: string) => ({
        productId,
        requestKey: randomUUID(),
        name: buyer.name,
        quantity: 1,
        meal: "lunch",
        startDate: day,
        days: 1,
        notes: "",
        fulfillment: "pickup",
      });
      const sent = await submitOrder(buyer, order(sellerProduct));
      assert.equal(sent.status, "pending");
      // الطلب يظهر للأسرة الطالبة في «طلباتي» وللأسرة البائعة في طلباتها.
      assert.ok((await memberOrders(buyer)).some((o) => o.id === sent.id));
      assert.ok((await producerOrders(seller)).some((o) => o.id === sent.id));
      assert.equal(
        (await producerOrders(buyer)).some((o) => o.id === sent.id),
        false,
      );
      // لا تطلب الأسرة من نفسها.
      await assert.rejects(submitOrder(buyer, order(buyerProduct)), {
        status: 403,
      });
    } finally {
      const families = [buyerFamily, sellerFamily];
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [buyer.id, seller.id],
      ]);
    }
  },
);
