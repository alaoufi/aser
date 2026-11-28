import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * جرس «الإشعارات» (قرار المالك 2026-11-27): كل إشعار يُرسل يُحفظ، والعدد لغير المقروء، والوسم نفسه
 * يستبدل غير المقروء، وكل عضو يرى إشعاراته فقط، والروابط داخل الموقع فقط.
 */
test(
  "every sent notification is kept for the bell, counted until read, and private to its member",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const push = await import("../src/server/push");
    const n = await import("../src/server/notifications");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = async () => {
      const u = {
        id: randomUUID(),
        name: "عضو",
        phone: phone(),
        role: "customer",
      };
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.name, u.phone, u.role],
      );
      return u as unknown as import("../src/lib/types").SessionUser;
    };
    push.setPushTransport(async () => {});
    const a = await mk();
    const b = await mk();
    try {
      await push.notifyUser(a.id, {
        title: "طلب جديد",
        body: "كليجا",
        url: "/orders",
      });
      await push.notifyUser(a.id, {
        title: "رسالة",
        body: "١",
        url: "/messages",
        tag: "chat-1",
      });
      await push.notifyUser(a.id, {
        title: "رسالة",
        body: "٢",
        url: "/messages",
        tag: "chat-1",
      });
      await push.notifyUser(a.id, {
        title: "رابط خارجي",
        body: "",
        url: "https://evil.example",
      });
      let mine = await n.myNotifications(a);
      assert.equal(mine.unread, 3, "الوسم نفسه يستبدل غير المقروء");
      assert.equal(mine.items[0].url, "/", "الروابط داخل الموقع فقط");
      assert.ok(mine.items.some((x) => x.body === "٢"));
      assert.ok(!mine.items.some((x) => x.body === "١"));
      // عضو آخر لا يرى ولا يعلّم إشعارات غيره.
      assert.equal((await n.myNotifications(b)).items.length, 0);
      await n.readNotifications(b, { read: mine.items[0].id });
      assert.equal((await n.myNotifications(a)).unread, 3);
      mine = await n.readNotifications(a, { read: mine.items[0].id });
      assert.equal(mine.unread, 2);
      mine = await n.readNotifications(a, { read: "all" });
      assert.equal(mine.unread, 0);
      await assert.rejects(n.readNotifications(a, { read: "bad" }));
    } finally {
      push.setPushTransport(null);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [a.id, b.id],
      ]);
      await pool.end();
    }
  },
);
