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
    } finally {
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
