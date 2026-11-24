import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  notifyUser,
  pushEndpointAllowed,
  pushPublicKey,
  setPushTransport,
  subscribePush,
  unsubscribePush,
} from "../src/server/push";

test(
  "isolated push: devices subscribe to their account, notifications reach them, expired devices are dropped",
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
      name: "عضو الإشعارات",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "customer" as const,
    };
    const endpoint = (n: string) =>
      `https://push.example.invalid/${user.id}/${n}`;
    const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
    const sent: { endpoint: string; payload: string }[] = [];
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [user.id, user.name, user.phone, user.role],
      );
      const key = await pushPublicKey();
      assert.ok(key.length > 40);
      assert.equal(await pushPublicKey(), key, "one key pair for the server");

      await assert.rejects(
        subscribePush(user, { endpoint: "http://insecure.invalid/x", keys }),
      );
      // خدمات الإشعارات الرسمية فقط: لا عنوان داخلي ولا موقع غريب (SSRF).
      for (const bad of [
        "https://169.254.169.254/latest",
        "https://localhost/x",
        "https://example.com/push",
        "https://fcm.googleapis.com:8443/x",
      ])
        await assert.rejects(subscribePush(user, { endpoint: bad, keys }));
      assert.ok(pushEndpointAllowed("https://fcm.googleapis.com/fcm/send/abc"));
      assert.ok(pushEndpointAllowed("https://web.push.apple.com/QAbc"));
      await subscribePush(user, { endpoint: endpoint("a"), keys });
      await subscribePush(user, {
        endpoint: endpoint("gone"),
        expirationTime: null,
        keys,
      });

      setPushTransport(async (sub, payload) => {
        if (sub.endpoint.endsWith("/gone"))
          throw Object.assign(new Error("gone"), { statusCode: 410 });
        sent.push({ endpoint: sub.endpoint, payload });
      });
      const count = await notifyUser(user.id, {
        title: "رسالة جديدة",
        body: "السلام عليكم",
        url: "/messages",
      });
      assert.equal(count, 1);
      assert.deepEqual(JSON.parse(sent[0].payload), {
        title: "رسالة جديدة",
        body: "السلام عليكم",
        url: "/messages",
      });
      const left = (
        await pool.query(
          "SELECT endpoint FROM jdatna.push_subscriptions WHERE user_id=$1",
          [user.id],
        )
      ).rows.map((r) => r.endpoint);
      assert.deepEqual(left, [endpoint("a")], "expired device removed");

      await unsubscribePush(user, { endpoint: endpoint("a") });
      assert.equal(
        await notifyUser(user.id, { title: "x", body: "y", url: "/" }),
        0,
      );
      // لا يرمي أبدًا حتى لمستخدم بلا أجهزة أو معرّف غير صالح.
      assert.equal(
        await notifyUser("not-a-uuid", { title: "x", body: "y", url: "/" }),
        0,
      );
    } finally {
      setPushTransport(null);
      await pool.query(
        "DELETE FROM jdatna.push_subscriptions WHERE user_id=$1",
        [user.id],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user.id]);
      await pool.end();
    }
  },
);
