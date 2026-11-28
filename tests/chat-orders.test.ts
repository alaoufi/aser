import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CANCEL_WINDOW_MS, chatOrderActions } from "../src/server/chat-orders";

/**
 * الطلب داخل المحادثة (قرار المالك 2026-11-27): الأسرة توافق فتُتمّ، والإلغاء خلال ١٠ دقائق من
 * الإتمام لأي طرف، وبعدها بالاتفاق فقط.
 */
test("chat order actions follow the 10-minute rule then need agreement", () => {
  const now = Date.now();
  const me = randomUUID();
  const other = randomUUID();
  const pending = {
    status: "pending",
    completedAt: null,
    cancelRequestedBy: null,
  };
  assert.deepEqual(chatOrderActions(pending, "producer", me, now), [
    "complete",
    "decline",
  ]);
  assert.deepEqual(chatOrderActions(pending, "customer", me, now), ["cancel"]);
  const fresh = {
    status: "completed",
    completedAt: new Date(now - CANCEL_WINDOW_MS + 60_000),
    cancelRequestedBy: null,
  };
  assert.deepEqual(chatOrderActions(fresh, "customer", me, now), ["cancel"]);
  assert.deepEqual(chatOrderActions(fresh, "producer", me, now), ["cancel"]);
  const old = { ...fresh, completedAt: new Date(now - CANCEL_WINDOW_MS - 1) };
  assert.deepEqual(chatOrderActions(old, "customer", me, now), [
    "request-cancel",
  ]);
  const asked = { ...old, cancelRequestedBy: other };
  assert.deepEqual(chatOrderActions(asked, "producer", me, now), [
    "agree-cancel",
    "keep",
  ]);
  assert.deepEqual(chatOrderActions(asked, "customer", other, now), []);
  for (const status of ["cancelled", "declined"])
    assert.deepEqual(
      chatOrderActions({ ...pending, status }, "producer", me, now),
      [],
    );
});

test(
  "a customer orders inside the family chat, the family completes it, and cancelling after 10 minutes needs both",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const push = await import("../src/server/push");
    const { startConversation } = await import("../src/server/chat");
    const co = await import("../src/server/chat-orders");
    const { adminSummary } = await import("../src/server/admin");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    push.setPushTransport(async () => {});
    const tag = randomUUID().slice(0, 8);
    const mk = (role: "customer" | "producer", name: string) =>
      ({
        id: randomUUID(),
        name,
        phone:
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        role,
      }) as unknown as import("../src/lib/types").SessionUser;
    const customer = mk("customer", "عميل الطلب");
    const family = mk("producer", "صاحبة الأسرة");
    const outsider = mk("customer", "غريب");
    const familyId = randomUUID();
    const otherFamilyId = randomUUID();
    const otherOwner = mk("producer", "أسرة أخرى");
    const product = randomUUID();
    const foreign = randomUUID();
    try {
      for (const u of [customer, family, outsider, otherOwner])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      for (const [id, owner] of [
        [familyId, family],
        [otherFamilyId, otherOwner],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة',$4,$5,'approved')",
          [id, owner.id, `co-${tag}-${id}`, city, owner.phone],
        );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible,price) VALUES($1,$2,'كليجا','وصف','box','available',true,30),($3,$4,'غريب','وصف','box','available',true,10)",
        [product, familyId, foreign, otherFamilyId],
      );
      const before = await adminSummary({
        ...family,
        role: "admin",
      } as never);
      const { id } = await startConversation(customer, {
        producer: `co-${tag}-${familyId}`,
      });
      const view = await co.chatOrders(customer, id);
      assert.deepEqual(
        view.products.map((p) => p.id),
        [product],
      );
      assert.deepEqual((await co.chatOrders(family, id)).products, []);
      await assert.rejects(co.chatOrders(outsider, id), { status: 404 });
      // منتج أسرة أخرى، والأسرة لا تطلب، وكمية غير صحيحة.
      await assert.rejects(
        co.createChatOrder(customer, id, { productId: foreign, quantity: 1 }),
        { status: 404 },
      );
      await assert.rejects(
        co.createChatOrder(family, id, { productId: product, quantity: 1 }),
        { status: 403 },
      );
      await assert.rejects(
        co.createChatOrder(customer, id, { productId: product, quantity: 0 }),
      );
      const made = await co.createChatOrder(customer, id, {
        productId: product,
        quantity: 2,
        notes: "بدون سمسم",
      });
      assert.equal(made.orders.length, 1);
      const order = made.orders[0];
      assert.equal(order.status, "pending");
      assert.equal(order.quantity, 2);
      assert.deepEqual(order.actions, ["cancel"]);
      const row = (
        await pool.query(
          "SELECT user_id,producer_id,product_id,customer_name,phone,notes FROM jdatna.order_requests WHERE id=$1",
          [order.id],
        )
      ).rows[0];
      assert.equal(row.user_id, customer.id);
      assert.equal(row.producer_id, familyId);
      assert.equal(row.phone, customer.phone);
      assert.equal(row.notes, "بدون سمسم");
      // رسالة الطلب في المحادثة، وإشعار للأسرة.
      const msgs = (
        await pool.query(
          "SELECT body FROM jdatna.messages WHERE conversation_id=$1 ORDER BY created_at",
          [id],
        )
      ).rows.map((m) => m.body as string);
      assert.match(msgs.at(-1) ?? "", /🧾 طلب: كليجا × 2/);
      // العميل لا يُتمّ، والأسرة تُتمّ.
      await assert.rejects(
        co.actOnChatOrder(customer, id, {
          orderId: order.id,
          action: "complete",
        }),
        { status: 409 },
      );
      const done = await co.actOnChatOrder(family, id, {
        orderId: order.id,
        action: "complete",
      });
      assert.equal(done.orders[0].status, "completed");
      assert.deepEqual(done.orders[0].actions, ["cancel"]);
      assert.ok(done.orders[0].cancelUntil);
      // بعد المهلة: الإلغاء المباشر مرفوض، ويلزم طلب وموافقة.
      await pool.query(
        "UPDATE jdatna.chat_orders SET completed_at=now()-interval '11 minutes' WHERE order_id=$1",
        [order.id],
      );
      await assert.rejects(
        co.actOnChatOrder(customer, id, {
          orderId: order.id,
          action: "cancel",
        }),
        { status: 409 },
      );
      const asked = await co.actOnChatOrder(customer, id, {
        orderId: order.id,
        action: "request-cancel",
      });
      assert.equal(asked.orders[0].cancelRequestedByMe, true);
      assert.deepEqual(asked.orders[0].actions, []);
      const famView = (await co.chatOrders(family, id)).orders[0];
      assert.deepEqual(famView.actions, ["agree-cancel", "keep"]);
      const kept = await co.actOnChatOrder(family, id, {
        orderId: order.id,
        action: "keep",
      });
      assert.equal(kept.orders[0].status, "completed");
      assert.equal(kept.orders[0].cancelRequestedAt, null);
      await co.actOnChatOrder(family, id, {
        orderId: order.id,
        action: "request-cancel",
      });
      const agreed = await co.actOnChatOrder(customer, id, {
        orderId: order.id,
        action: "agree-cancel",
      });
      assert.equal(agreed.orders[0].status, "cancelled");
      assert.deepEqual(agreed.orders[0].actions, []);
      // طلب ثانٍ يُتمّ: المنفّذة والملغاة في ملخص الإدارة.
      const second = (
        await co.createChatOrder(customer, id, {
          productId: product,
          quantity: 1,
        })
      ).orders[0];
      await co.actOnChatOrder(family, id, {
        orderId: second.id,
        action: "complete",
      });
      const after = await adminSummary({ ...family, role: "admin" } as never);
      assert.equal(after.ordersCompleted - before.ordersCompleted, 1);
      assert.equal(after.ordersCancelled - before.ordersCancelled, 1);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=ANY($1::uuid[])",
        [[familyId, otherFamilyId]],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=$1",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
        [[familyId, otherFamilyId]],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[familyId, otherFamilyId]],
      );
      await pool.query(
        "DELETE FROM jdatna.notifications WHERE user_id=ANY($1::uuid[])",
        [[customer.id, family.id, outsider.id, otherOwner.id]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [customer.id, family.id, outsider.id, otherOwner.id],
      ]);
    }
  },
);
