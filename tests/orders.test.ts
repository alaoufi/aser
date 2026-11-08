import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  parseOrderRequest,
  assertOrderProduct,
  orderSnapshot,
  assertOrderTransition,
  assertOfferMeal,
} from "../src/server/orders";
import {
  submitOrder,
  memberOrders,
  producerOrders,
  reorderDraft,
  updateOrder,
} from "../src/server/orders";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";
import { hash } from "../src/server/auth";
import {
  GET as historyRoute,
  POST as createRoute,
} from "../src/app/api/orders/route";
import { GET as draftRoute } from "../src/app/api/orders/[id]/reorder/route";

const now = new Date("2026-11-08T10:00:00Z");
const input = () => ({
  productId: randomUUID(),
  requestKey: randomUUID(),
  name: "طالب الخدمة",
  phone: "0501234567",
  quantity: 2,
  meal: "lunch",
  startDate: "2026-11-09",
  days: 30,
  notes: "بدون ملح",
});
test("request accepts inclusive days and end date, normalized phone", () => {
  const value = parseOrderRequest(input(), now);
  assert.equal(value.endDate, "2026-12-08");
  assert.equal(value.days, 30);
  assert.equal(value.phone, "+966501234567");
  const { days, ...rest } = input();
  assert.equal(
    parseOrderRequest({ ...rest, endDate: rest.startDate }, now).days,
    1,
  );
});
test("request rejects ambiguous, invalid, past, excessive duration and future dates", () => {
  for (const patch of [
    { days: 0 },
    { days: 367 },
    { days: 1.5 },
    { startDate: "2026-02-30" },
    { startDate: "2026-11-07" },
    { startDate: "2028-01-01" },
    { endDate: "2026-11-10" },
    { quantity: 0 },
    { quantity: 1001 },
    { phone: "123" },
    { meal: "other" },
    { name: " " },
    { notes: "a".repeat(2001) },
    { userId: randomUUID() },
  ]) {
    assert.throws(() => parseOrderRequest({ ...input(), ...patch }, now));
  }
  const { days, ...rest } = input();
  assert.throws(() => parseOrderRequest(rest, now));
  assert.throws(() =>
    parseOrderRequest({ ...rest, endDate: "2026-11-08" }, now),
  );
  assert.equal(parseOrderRequest({ ...input(), days: 366 }, now).days, 366);
});
test("only approved visible available/preorder products accept requests", () => {
  const product = {
    name: "طبق",
    unit: "وجبة",
    price: "20.00",
    status: "available",
    visible: true,
    producerStatus: "approved",
    producerName: "الأسرة",
  };
  assert.doesNotThrow(() => assertOrderProduct(product));
  assert.doesNotThrow(() =>
    assertOrderProduct({ ...product, status: "preorder" }),
  );
  for (const patch of [
    { status: "unavailable" },
    { visible: false },
    { producerStatus: "pending" },
    { producerStatus: "suspended" },
  ])
    assert.throws(() => assertOrderProduct({ ...product, ...patch }));
  assert.throws(() => assertOrderProduct(undefined));
});
test("snapshots copy current product values and contain only safe offer summary", () => {
  const product = {
    name: "طبق",
    unit: "وجبة",
    price: "20.00",
    producerName: "الأسرة",
  };
  const snapshot = orderSnapshot(product, { label: "عرض", price: 15 });
  product.name = "معدل";
  assert.deepEqual(snapshot, {
    productName: "طبق",
    unit: "وجبة",
    price: 20,
    producerName: "الأسرة",
    offer: { label: "عرض", price: 15 },
  });
});
test("family status transition rejects terminal reopening and invalid jumps", () => {
  for (const [a, b] of [
    ["pending", "accepted"],
    ["pending", "declined"],
    ["pending", "cancelled"],
    ["accepted", "completed"],
    ["accepted", "cancelled"],
    ["accepted", "accepted"],
  ])
    assert.doesNotThrow(() => assertOrderTransition(a, b));
  for (const [a, b] of [
    ["pending", "completed"],
    ["declined", "accepted"],
    ["completed", "pending"],
    ["cancelled", "accepted"],
    ["accepted", "declined"],
  ])
    assert.throws(() => assertOrderTransition(a, b));
});
test("an offer with price by agreement preserves null independently of the base product price", () => {
  const snapshot = orderSnapshot(
    { name: "طبق", unit: "وجبة", price: 20, producerName: "أسرة" },
    { label: "عرض بالاتفاق", price: null },
  );
  assert.equal(snapshot.price, 20);
  assert.deepEqual(snapshot.offer, { label: "عرض بالاتفاق", price: null });
});
test("an offer applies only to its configured meal", () => {
  assert.doesNotThrow(() => assertOfferMeal("breakfast", "breakfast"));
  assert.throws(() => assertOfferMeal("dinner", "breakfast"), { status: 400 });
});

test(
  "isolated orders persist guest/member requests, deduplicate concurrently and enforce session/family ownership",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const name = (await db().query("SELECT current_database() AS name")).rows[0]
      .name as string;
    assert.ok(
      name.startsWith("jdatna_test_"),
      "Requires isolated jdatna_test_ database",
    );
    const userIds = Array.from({ length: 4 }, () => randomUUID()),
      producerIds = [randomUUID(), randomUUID()],
      productId = randomUUID();
    const region = "orders-" + randomUUID(),
      city = "orders-" + randomUUID();
    const users: SessionUser[] = userIds.map((id, index) => ({
      id,
      name: "اختبار طلب معزول",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: index < 2 ? "producer" : "customer",
    }));
    const token = randomUUID().replaceAll("-", "").repeat(2);
    const startDate = new Date(Date.now() + 86400000)
      .toISOString()
      .slice(0, 10);
    try {
      await db().query("INSERT INTO jdatna.regions(id,name) VALUES($1,$1)", [
        region,
      ]);
      await db().query(
        "INSERT INTO jdatna.cities(id,name,region_id) VALUES($1,$1,$2)",
        [city, region],
      );
      for (const user of users)
        await db().query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [user.id, user.name, user.phone, user.role],
        );
      for (let i = 0; i < 2; i++)
        await db().query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$5,'أسرة اختبار',$3,$4,'approved')",
          [
            producerIds[i],
            users[i].id,
            city,
            users[i].phone,
            `orders-${producerIds[i]}`,
          ],
        );
      await db().query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'طبق أصلي','اختبار',20,'وجبة','available')",
        [productId, producerIds[0]],
      );
      await db().query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), users[2].id],
      );
      const payload = {
        ...input(),
        productId,
        startDate,
        phone: users[2].phone,
      };
      const receipts = await Promise.all([
        submitOrder(users[2], payload),
        submitOrder(users[2], payload),
      ]);
      assert.equal(receipts[0].id, receipts[1].id);
      assert.equal((await memberOrders(users[2])).length, 1);
      assert.equal((await memberOrders(users[3])).length, 0);
      assert.equal((await producerOrders(users[0])).length, 1);
      assert.equal((await producerOrders(users[1])).length, 0);
      await assert.rejects(submitOrder(users[2], { ...payload, quantity: 3 }), {
        status: 409,
      });
      await assert.rejects(submitOrder(users[3], payload), { status: 409 });
      const guest = await submitOrder(null, {
        ...payload,
        requestKey: randomUUID(),
      });
      assert.ok(guest.id);
      assert.equal(
        (await memberOrders(users[2])).length,
        1,
        "guest phone must never claim member history",
      );
      assert.equal((await producerOrders(users[0])).length, 2);
      await assert.rejects(
        updateOrder(users[1], { id: receipts[0].id, status: "accepted" }),
        { status: 404 },
      );
      await assert.rejects(reorderDraft(users[3], receipts[0].id), {
        status: 404,
      });
      assert.equal(
        (await reorderDraft(users[2], receipts[0].id)).productName,
        "طبق أصلي",
      );
      await db().query(
        "UPDATE jdatna.products SET name='طبق معدل',price=99 WHERE id=$1",
        [productId],
      );
      assert.equal(
        (await memberOrders(users[2]))[0].snapshot.productName,
        "طبق أصلي",
      );
      const draft = await reorderDraft(users[2], receipts[0].id);
      assert.equal(draft.productName, "طبق معدل");
      assert.equal("offerId" in draft, false);
      assert.equal("startDate" in draft, false);
      await updateOrder(users[0], { id: receipts[0].id, status: "accepted" });
      await updateOrder(users[0], { id: receipts[0].id, status: "completed" });
      await assert.rejects(
        updateOrder(users[0], { id: receipts[0].id, status: "accepted" }),
        { status: 409 },
      );
      const denied = await historyRoute(
        new Request("http://localhost/api/orders?phone=" + users[2].phone),
        {},
      );
      assert.equal(denied.status, 401);
      const history = await historyRoute(
        new Request("http://localhost/api/orders?userId=" + users[3].id, {
          headers: { cookie: "jdatna_session=" + token },
        }),
        {},
      );
      assert.equal((await history.json()).orders.length, 1);
      const noSessionDraft = await draftRoute(
        new Request("http://localhost/api/orders/x/reorder"),
        { params: Promise.resolve({ id: receipts[0].id }) },
      );
      assert.equal(noSessionDraft.status, 401);
      const csrf = await createRoute(
        new Request("http://localhost/api/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        {},
      );
      assert.equal(csrf.status, 403);
      const offerId = randomUUID();
      await db().query(
        `INSERT INTO jdatna.offers(id,producer_id,product_id,title,description,terms,price,audience,meal,starts_at,ends_at,enabled) VALUES($1,$2,$3,'عرض معزول','','شروط خارج الموقع',15,'students','lunch',now()-interval '1 hour',now()+interval '1 day',true)`,
        [offerId, producerIds[0], productId],
      );
      const offered = { ...payload, offerId, requestKey: randomUUID() };
      await assert.rejects(submitOrder(null, offered), { status: 404 });
      await assert.rejects(submitOrder(users[2], offered), { status: 404 });
      await db().query(
        "INSERT INTO jdatna.offer_preferences(user_id,audience) VALUES($1,'students')",
        [users[2].id],
      );
      const offeredReceipt = await submitOrder(users[2], offered);
      await assert.rejects(
        submitOrder(users[2], {
          ...offered,
          requestKey: randomUUID(),
          meal: "dinner",
        }),
        { status: 400 },
      );
      const offeredOrder = (await memberOrders(users[2])).find(
        (order) => order.id === offeredReceipt.id,
      );
      assert.deepEqual(offeredOrder.snapshot.offer, {
        label: "عرض معزول",
        price: 15,
      });
      await db().query("UPDATE jdatna.offers SET enabled=false WHERE id=$1", [
        offerId,
      ]);
      await assert.rejects(
        submitOrder(users[2], { ...offered, requestKey: randomUUID() }),
        { status: 404 },
      );
      // A safe retry returns the original receipt, without creating a second order or reusing a disabled offer.
      assert.equal(
        (await submitOrder(users[2], offered)).id,
        offeredReceipt.id,
      );
      for (const patch of [
        "UPDATE jdatna.products SET status='unavailable' WHERE id=$1",
        "UPDATE jdatna.products SET status='available',visible=false WHERE id=$1",
      ]) {
        await db().query(patch, [productId]);
        await assert.rejects(
          submitOrder(null, { ...payload, requestKey: randomUUID() }),
          { status: 404 },
        );
        await assert.rejects(reorderDraft(users[2], receipts[0].id), {
          status: 404,
        });
      }
      await db().query("UPDATE jdatna.products SET visible=true WHERE id=$1", [
        productId,
      ]);
      await db().query(
        "UPDATE jdatna.producer_profiles SET status='suspended' WHERE id=$1",
        [producerIds[0]],
      );
      await assert.rejects(
        submitOrder(null, { ...payload, requestKey: randomUUID() }),
        { status: 404 },
      );
      assert.equal(
        (await submitOrder(users[2], payload)).id,
        receipts[0].id,
        "safe retries retain original receipt despite later availability",
      );
    } finally {
      await db().query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      await db().query(
        "DELETE FROM jdatna.offers WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      await db().query(
        "DELETE FROM jdatna.offer_preferences WHERE user_id=ANY($1::uuid[])",
        [userIds],
      );
      await db().query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await db().query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producerIds],
      );
      await db().query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [userIds],
      );
      await db().query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        userIds,
      ]);
      await db().query("DELETE FROM jdatna.cities WHERE id=$1", [city]);
      await db().query("DELETE FROM jdatna.regions WHERE id=$1", [region]);
      await db().end();
    }
  },
);
