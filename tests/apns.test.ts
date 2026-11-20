import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  registerApnsDevice,
  removeApnsDevice,
  setApnsTransport,
} from "../src/server/apns";
import { notifyUser, setPushTransport } from "../src/server/push";

// إشعارات تطبيق الآيفون: الجهاز يُربط بالحساب، والإشعار نفسه يصل للآيفون مع الويب وأندرويد،
// والرمز الذي ترفضه Apple يُحذف.
test(
  "isolated Apple push: iPhones get the same notification, rejected tokens are dropped",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const user = {
      id: randomUUID(),
      name: "عضو الآيفون",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "customer" as const,
    };
    const good = "a".repeat(64);
    const gone = "b".repeat(64);
    const sent: {
      token: string;
      payload: string;
      headers: Record<string, string>;
    }[] = [];
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [user.id, user.name, user.phone, user.role],
      );
      await assert.rejects(registerApnsDevice(user, { token: "not-hex" }));
      await assert.rejects(registerApnsDevice(user, { token: good, x: 1 }));
      await registerApnsDevice(user, { token: good.toUpperCase() });
      await registerApnsDevice(user, { token: gone });

      setPushTransport(async () => {});
      setApnsTransport(async (token, payload, headers) => {
        if (token === gone) return { status: 410, reason: "Unregistered" };
        sent.push({ token, payload, headers });
        return { status: 200 };
      });
      const count = await notifyUser(user.id, {
        title: "رسالة جديدة",
        body: "السلام عليكم",
        url: "/messages?c=1",
        tag: "chat-1",
      });
      assert.equal(count, 1);
      assert.equal(sent[0].token, good, "token stored in lower case");
      assert.deepEqual(JSON.parse(sent[0].payload), {
        aps: {
          alert: { title: "رسالة جديدة", body: "السلام عليكم" },
          sound: "default",
          "thread-id": "chat-1",
        },
        url: "/messages?c=1",
      });
      assert.equal(sent[0].headers["apns-topic"], "com.jdatna.app");
      assert.equal(sent[0].headers["apns-push-type"], "alert");
      assert.equal(sent[0].headers["apns-collapse-id"], "chat-1");
      const left = (
        await pool.query(
          "SELECT token FROM jdatna.apns_devices WHERE user_id=$1",
          [user.id],
        )
      ).rows.map((r) => r.token);
      assert.deepEqual(left, [good], "rejected token removed");

      await removeApnsDevice(user, { token: good });
      assert.equal(
        await notifyUser(user.id, { title: "x", body: "y", url: "/" }),
        0,
      );
    } finally {
      setApnsTransport(null);
      setPushTransport(null);
      await pool.query("DELETE FROM jdatna.apns_devices WHERE user_id=$1", [
        user.id,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user.id]);
      await pool.end();
    }
  },
);
