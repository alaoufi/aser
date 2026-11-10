import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  startConversation,
  listConversations,
  conversationMessages,
  sendMessage,
  unreadTotal,
  unreadConversations,
  moderateConversation,
} from "../src/server/chat";

test(
  "isolated chat: members start with approved families, only participants read, messages persist and unread clears",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const tag = randomUUID().slice(0, 8);
    const mk = (role: "customer" | "producer", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const customer = mk("customer", "عميل محادثة"),
      family = mk("producer", "صاحبة الأسرة"),
      outsider = mk("customer", "غريب"),
      pending = mk("producer", "أسرة غير معتمدة");
    const familyId = randomUUID(),
      pendingId = randomUUID();
    const ids: { product?: string } = {};
    try {
      for (const u of [customer, family, outsider, pending])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      for (const [id, owner, status] of [
        [familyId, family, "approved"],
        [pendingId, pending, "pending"],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            owner.id,
            "chat-" + tag + "-" + id,
            "أسرة " + status,
            city,
            owner.phone,
            status,
          ],
        );
      await assert.rejects(
        startConversation(customer, {
          producer: "chat-" + tag + "-" + pendingId,
        }),
        { status: 404 },
      );
      await assert.rejects(
        startConversation(family, { producer: "chat-" + tag + "-" + familyId }),
        { status: 400 },
      );
      const { id } = await startConversation(customer, {
        producer: "chat-" + tag + "-" + familyId,
      });
      assert.equal(
        (
          await startConversation(customer, {
            producer: "chat-" + tag + "-" + familyId,
          })
        ).id,
        id,
        "one conversation per member and family",
      );
      await sendMessage(customer, id, { body: "  السلام عليكم، متى الجريش؟ " });
      await assert.rejects(sendMessage(customer, id, { body: "   " }));
      await assert.rejects(sendMessage(outsider, id, { body: "تطفل" }), {
        status: 404,
      });
      await assert.rejects(conversationMessages(outsider, id), { status: 404 });
      await assert.rejects(conversationMessages(customer, "not-a-uuid"), {
        status: 404,
      });

      // الأسرة ترى المحادثة باسم العميل، ورسالة غير مقروءة.
      const familyList = await listConversations(family);
      const row = familyList.find((c) => c.id === id)!;
      assert.equal(row.side, "producer");
      assert.equal(row.title, customer.name);
      assert.equal(row.unread, 1);
      assert.equal(row.preview, "السلام عليكم، متى الجريش؟");
      assert.equal(await unreadTotal(family), 1);
      const opened = await conversationMessages(family, id);
      assert.equal(opened.messages.length, 1);
      assert.equal(opened.messages[0].mine, false);
      assert.equal(await unreadTotal(family), 0, "opening marks read");

      const reply = await sendMessage(family, id, {
        body: "جاهز بكرة إن شاء الله",
      });
      const customerList = await listConversations(customer);
      assert.equal(
        customerList.find((c) => c.id === id)?.title,
        "أسرة approved",
      );
      assert.equal(await unreadTotal(customer), 1);
      const later = await conversationMessages(
        customer,
        id,
        new Date(new Date(reply.createdAt).getTime() - 1).toISOString(),
      );
      assert.deepEqual(
        later.messages.map((m) => m.body),
        ["جاهز بكرة إن شاء الله"],
      );
      const all = await conversationMessages(customer, id);
      assert.deepEqual(
        all.messages.map((m) => [m.mine, m.body]),
        [
          [true, "السلام عليكم، متى الجريش؟"],
          [false, "جاهز بكرة إن شاء الله"],
        ],
      );
      assert.equal((await listConversations(outsider)).length, 0);

      // تنبيه الرسائل الجديدة: المجموع وأحدث المحادثات بنص آخر رسالة.
      await sendMessage(family, id, { body: "وصلك الطلب؟" });
      const alert = await unreadConversations(customer);
      assert.equal(alert.total, 1);
      assert.equal(alert.conversations[0].id, id);
      assert.equal(alert.conversations[0].preview, "وصلك الطلب؟");
      assert.equal((await unreadConversations(outsider)).total, 0);

      // بدء المحادثة من الطلب: صاحب الطلب والأسرة يصلان لنفس المحادثة، وغيرهما لا.
      const productId = randomUUID(),
        orderId = randomUUID(),
        guestOrder = randomUUID();
      ids.product = productId;
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'طبق المحادثة','test','meal','available')",
        [productId, familyId],
      );
      for (const [oid, uid] of [
        [orderId, customer.id],
        [guestOrder, null],
      ])
        await pool.query(
          "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,'pending')",
          [oid, randomUUID(), uid, familyId, productId],
        );
      assert.equal(
        (await startConversation(customer, { order: orderId })).id,
        id,
      );
      assert.equal(
        (await startConversation(family, { order: orderId })).id,
        id,
      );
      await assert.rejects(startConversation(outsider, { order: orderId }), {
        status: 404,
      });
      await assert.rejects(startConversation(family, { order: guestOrder }), {
        status: 400,
      });
      await assert.rejects(
        startConversation(customer, { order: orderId, producer: "x" }),
      );

      // الحظر يوقف الإرسال للطرفين، ولا يلغيه إلا من حظر، والبلاغ يصل للإدارة.
      assert.deepEqual(
        await moderateConversation(customer, id, { action: "block" }),
        {
          reported: false,
          blocked: true,
          blockedByMe: true,
        },
      );
      await assert.rejects(sendMessage(family, id, { body: "مرحبا" }), {
        status: 403,
      });
      await assert.rejects(sendMessage(customer, id, { body: "مرحبا" }), {
        status: 403,
      });
      assert.equal(
        (await conversationMessages(family, id)).conversation.blocked,
        true,
      );
      assert.equal(
        (await conversationMessages(family, id)).conversation.blockedByMe,
        false,
      );
      await assert.rejects(
        moderateConversation(family, id, { action: "unblock" }),
        { status: 403 },
      );
      await assert.rejects(
        moderateConversation(outsider, id, { action: "block" }),
        { status: 404 },
      );
      await moderateConversation(customer, id, { action: "unblock" });
      await sendMessage(family, id, { body: "تم" });
      await assert.rejects(
        moderateConversation(family, id, { action: "report", reason: "قصير" }),
      );
      const reported = await moderateConversation(family, id, {
        action: "report",
        reason: "رسائل مزعجة متكررة من العميل",
      });
      assert.deepEqual(reported, {
        reported: true,
        blocked: false,
        blockedByMe: false,
      });
      const report = (
        await pool.query(
          "SELECT reporter_id,producer_id,reason FROM jdatna.reports WHERE producer_id=$1",
          [familyId],
        )
      ).rows[0];
      assert.equal(report.reporter_id, family.id);
      assert.match(report.reason, /بلاغ محادثة/);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.reports WHERE producer_id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      if (ids.product) {
        await pool.query(
          "DELETE FROM jdatna.order_requests WHERE product_id=$1",
          [ids.product],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          ids.product,
        ]);
      }
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=ANY($1::uuid[]))",
        [[familyId, pendingId]],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [customer.id, family.id, outsider.id, pending.id],
      ]);
      await pool.end();
    }
  },
);
