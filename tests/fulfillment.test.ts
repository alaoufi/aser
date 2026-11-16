import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chooseFulfillment,
  submitOrder,
  memberOrders,
  producerOrders,
  updateOrder,
} from "../src/server/orders";
import { ownFulfillment, saveFulfillment } from "../src/server/management";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";

test("the order method comes only from what the family offers; delivery needs the customer's location", () => {
  const both = { pickup: true, delivery: true };
  assert.deepEqual(chooseFulfillment({ pickup: true, delivery: false }), {
    method: "pickup",
    location: null,
  });
  assert.throws(() => chooseFulfillment(both), /اختر طريقة الاستلام/);
  assert.throws(
    () => chooseFulfillment({ pickup: true, delivery: false }, "delivery"),
    /لا توصّل/,
  );
  assert.throws(
    () => chooseFulfillment({ pickup: false, delivery: true }, "pickup"),
    /لا تقدم التسليم المباشر/,
  );
  assert.throws(() => chooseFulfillment(both, "delivery", " "), /أرسل موقعك/);
  assert.deepEqual(
    chooseFulfillment(
      both,
      "delivery",
      " https://maps.google.com/?q=24.7,46.6 ",
    ),
    { method: "delivery", location: "https://maps.google.com/?q=24.7,46.6" },
  );
  // الشحن لكل المملكة توصيل كذلك.
  assert.equal(
    chooseFulfillment(
      { pickup: false, delivery: false, deliveryScope: "kingdom" },
      undefined,
      "الرياض، حي النخيل",
    ).method,
    "delivery",
  );
});

test(
  "isolated fulfillment: family sets methods without re-review; pickup location shows after acceptance, delivery location reaches the family",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const mk = (role: "customer" | "producer"): SessionUser => ({
      id: randomUUID(),
      name: "اختبار التسليم",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const owner = mk("producer"),
      buyer = mk("customer");
    const familyId = randomUUID(),
      productId = randomUUID();
    try {
      for (const u of [owner, buyer])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,pickup,delivery) VALUES($1,$2,$3,'أسرة التسليم',$4,$5,'approved',true,false)",
        [familyId, owner.id, "fulfil-" + familyId, city, owner.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'كليجا','وصف',20,'علبة','available')",
        [productId, familyId],
      );
      // التسليم المباشر يحتاج موقعًا، ولا بد من طريقة واحدة على الأقل.
      await assert.rejects(
        saveFulfillment(owner, { pickup: true, delivery: false }),
        /موقع التسليم المباشر/,
      );
      await assert.rejects(
        saveFulfillment(owner, { pickup: false, delivery: false }),
        /أو كليهما/,
      );
      const pickupAt = "https://maps.google.com/?q=26.33,43.97";
      // التوصيل فقط: موقع الأسرة يُحفظ إن كُتب (لاستلام المندوب)، والقصير مرفوض.
      await assert.rejects(
        saveFulfillment(owner, {
          pickup: false,
          delivery: true,
          pickupLocation: "حي",
        }),
        /موقع الأسرة كاملًا/,
      );
      await saveFulfillment(owner, {
        pickup: false,
        delivery: true,
        pickupLocation: pickupAt,
      });
      assert.equal((await ownFulfillment(owner)).pickupLocation, pickupAt);
      await saveFulfillment(owner, {
        pickup: true,
        delivery: true,
        pickupLocation: pickupAt,
      });
      assert.deepEqual(await ownFulfillment(owner), {
        pickup: true,
        delivery: true,
        pickupLocation: pickupAt,
      });
      // تعديل طرق التسليم لا يعيد الأسرة للمراجعة.
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=$1",
            [familyId],
          )
        ).rows[0].status,
        "approved",
      );
      const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
      const order = (extra: object) => ({
        productId,
        requestKey: randomUUID(),
        name: "عميل",
        quantity: 1,
        meal: "lunch",
        startDate: day,
        days: 1,
        notes: "",
        ...extra,
      });
      await assert.rejects(submitOrder(buyer, order({})), {
        status: 400,
      });
      const picked = await submitOrder(buyer, order({ fulfillment: "pickup" }));
      const delivered = await submitOrder(
        buyer,
        order({
          fulfillment: "delivery",
          deliveryLocation: "عنيزة، حي الريان",
        }),
      );
      const mine = async (id: string) =>
        (await memberOrders(buyer)).find((o) => o.id === id);
      // قبل القبول لا يرى العميل موقع الأسرة.
      assert.equal((await mine(picked.id)).pickupLocation, null);
      await updateOrder(owner, { id: picked.id, status: "accepted" });
      assert.equal((await mine(picked.id)).pickupLocation, pickupAt);
      assert.equal((await mine(picked.id)).fulfillment, "pickup");
      // موقع التوصيل يصل للأسرة مع الطلب.
      const theirs = (await producerOrders(owner)).find(
        (o) => o.id === delivered.id,
      );
      assert.equal(theirs.fulfillment, "delivery");
      assert.equal(theirs.deliveryLocation, "عنيزة، حي الريان");
      assert.equal((await mine(delivered.id)).pickupLocation, null);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
        [familyId],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [owner.id, buyer.id],
      ]);
    }
  },
);
