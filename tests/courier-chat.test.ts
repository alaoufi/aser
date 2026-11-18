import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  adminDeletedConversations,
  conversationMessages,
  deleteConversation,
  listConversations,
  moderateConversation,
  sendMessage,
  startConversation,
} from "../src/server/chat";
import type { SessionUser } from "../src/lib/types";

test(
  "customers chat with public couriers and with their order's courier; private couriers stay with their family",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: SessionUser["role"], name: string): SessionUser => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const customer = mk("customer", "عميل المحادثة"),
      other = mk("customer", "عميل آخر"),
      family = mk("producer", "أسرة المحادثة"),
      publicCourier = mk("courier", "مندوب عام"),
      privateCourier = mk("courier", "مندوب خاص"),
      admin = mk("admin", "مدير المحادثات");
    const users = [
      customer,
      other,
      family,
      publicCourier,
      privateCourier,
      admin,
    ];
    const familyId = randomUUID(),
      productId = randomUUID(),
      orderId = randomUUID();
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ المحادثة',$4,$5,'approved')",
        [
          familyId,
          family.id,
          "chat-" + familyId.slice(0, 8),
          city,
          family.phone,
        ],
      );
      await pool.query(
        `INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,status,national_id_encrypted)
         VALUES($1,$2,'مندوب عام',$3,'كامري','approved','\\x00')`,
        [randomUUID(), publicCourier.id, city],
      );
      await pool.query(
        `INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,status,family_id,pledged_by,pledged_at)
         VALUES($1,$2,'مندوب خاص',$3,'دباب','approved',$4,$5,now())`,
        [randomUUID(), privateCourier.id, city, familyId, family.id],
      );
      // العميل مع مندوب عام من «التجمع»: محادثة واحدة يعاد فتحها.
      const chat = await startConversation(customer, {
        courier: publicCourier.id,
      });
      assert.equal(
        (await startConversation(customer, { courier: publicCourier.id })).id,
        chat.id,
      );
      // المندوب الخاص لا يُراسل من التجمع.
      await assert.rejects(
        startConversation(customer, { courier: privateCourier.id }),
        { status: 404 },
      );
      await sendMessage(customer, chat.id, {
        body: "السلام عليكم، توصيل للملقا؟",
      });
      await sendMessage(publicCourier, chat.id, { body: "وعليكم السلام، نعم" });
      const mine = (await listConversations(customer)).find(
        (c) => c.id === chat.id,
      );
      assert.equal(mine?.kind, "courier");
      assert.equal(mine?.title, "مندوب عام");
      assert.equal(mine?.unread, 1);
      const his = (await listConversations(publicCourier)).find(
        (c) => c.id === chat.id,
      );
      assert.equal(his?.kind, "customer");
      assert.equal(his?.title, customer.name);
      const thread = await conversationMessages(publicCourier, chat.id);
      assert.equal(thread.messages.length, 2);
      assert.equal(thread.conversation.kind, "customer");
      // غير الطرفين لا يرى المحادثة.
      await assert.rejects(conversationMessages(other, chat.id), {
        status: 404,
      });

      // طلب أسندته الأسرة لمندوبها الخاص: العميل ومندوب الطلب يتراسلان من الطلب.
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'كبسة','وصف','طبق','available')",
        [productId, familyId],
      );
      await pool.query(
        `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status)
         VALUES($1,$2,'h',$3,$4,$5,'{}',$6,$7,1,'lunch',current_date+1,current_date+1,'preparing')`,
        [
          orderId,
          randomUUID(),
          customer.id,
          familyId,
          productId,
          customer.name,
          customer.phone,
        ],
      );
      await pool.query(
        "INSERT INTO jdatna.order_couriers(order_id,courier_user_id,pickup_location,assigned_by) VALUES($1,$2,'موقع الأسرة',$3)",
        [orderId, privateCourier.id, family.id],
      );
      const delivery = await startConversation(privateCourier, {
        delivery: orderId,
      });
      assert.equal(
        (await startConversation(customer, { delivery: orderId })).id,
        delivery.id,
      );
      await assert.rejects(startConversation(other, { delivery: orderId }), {
        status: 404,
      });
      await assert.rejects(
        startConversation(publicCourier, { delivery: orderId }),
        { status: 404 },
      );
      // الإبلاغ والحذف يعملان في محادثة المندوب؛ والمحذوفة تظهر للإدارة باسم المندوب.
      await moderateConversation(customer, delivery.id, {
        action: "report",
        reason: "بلاغ تجريبي عن محادثة التوصيل",
      });
      await deleteConversation(privateCourier, delivery.id);
      assert.ok(
        (await adminDeletedConversations(admin)).some(
          (d) =>
            d.conversationId === delivery.id &&
            d.familyName === "المندوب: مندوب خاص",
        ),
      );
      assert.equal(
        (await listConversations(customer)).some((c) => c.id === delivery.id),
        false,
      );
    } finally {
      const ids = users.map((u) => u.id);
      await pool.query(
        "DELETE FROM jdatna.reports WHERE reporter_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.conversation_deletions WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE customer_id=ANY($1::uuid[]))",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE customer_id=ANY($1::uuid[]))",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE customer_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.order_requests WHERE id=$1", [
        orderId,
      ]);
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
    }
  },
);
