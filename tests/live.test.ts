import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { conversationMessages, sendMessage } from "../src/server/chat";
import { stopLive, subscribeLive, type LiveEvent } from "../src/server/live";

test(
  "isolated live chat: a sent message reaches both sides instantly, and reading notifies the sender once",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "customer" | "producer", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
      permissions: [] as string[],
    });
    const customer = mk("customer", "عميل البث"),
      family = mk("producer", "أسرة البث");
    const producerId = randomUUID(),
      conversationId = randomUUID();
    const got: Record<string, LiveEvent[]> = { c: [], f: [] };
    const offC = subscribeLive(customer.id, (e) => got.c.push(e));
    const offF = subscribeLive(family.id, (e) => got.f.push(e));
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 40 && !check(); i++)
        await new Promise((r) => setTimeout(r, 50));
    };
    try {
      for (const u of [customer, family])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة البث',$4,$5,'approved')",
        [producerId, family.id, "live-" + producerId, city, family.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.conversations(id,customer_id,producer_id) VALUES($1,$2,$3)",
        [conversationId, customer.id, producerId],
      );
      // انتظار جاهزية اتصال الاستماع.
      await new Promise((r) => setTimeout(r, 300));

      await sendMessage(customer as never, conversationId, { body: "السلام" });
      await until(() => got.f.length > 0 && got.c.length > 0);
      assert.deepEqual(got.f[0], { type: "message", c: conversationId });
      assert.deepEqual(got.c[0], { type: "message", c: conversationId });

      // الأسرة تفتح المحادثة: يصل «قُرئت» للعميل مرة واحدة، وفتحها ثانية لا يكرره.
      got.c.length = 0;
      await conversationMessages(family as never, conversationId);
      await until(() => got.c.length > 0);
      assert.deepEqual(got.c, [{ type: "read", c: conversationId }]);
      await conversationMessages(family as never, conversationId);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(got.c.length, 1, "no repeated read events (no ping-pong)");
    } finally {
      offC();
      offF();
      await pool.query("DELETE FROM jdatna.messages WHERE conversation_id=$1", [
        conversationId,
      ]);
      await pool.query("DELETE FROM jdatna.conversations WHERE id=$1", [
        conversationId,
      ]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        producerId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [customer.id, family.id],
      ]);
      await stopLive();
      await pool.end();
    }
  },
);
