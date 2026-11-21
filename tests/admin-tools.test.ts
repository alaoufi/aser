import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";

/**
 * «سجل النشاطات» و«تكاملات API» (من «أي خدمة»): للمدير الكامل وحده. السجل يُصفّى بالنوع والعضو ويُقرأ
 * بالصفحات، والتكاملات تقول «مربوطة أو لا» ولا تُرجع أي مفتاح أو جزءًا منه.
 */
const mk = (role: SessionUser["role"], permissions: string[] = []) =>
  ({
    id: randomUUID(),
    name: "عضو " + randomUUID().slice(0, 6),
    phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
    role,
    permissions,
  }) as SessionUser;

test("integrations say connected or not and never return a key", async () => {
  const { integrations } = await import("../src/server/integrations");
  const secrets = {
    R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    R2_BUCKET: "bucket-secret-name",
    R2_ACCESS_KEY_ID: "AKIA-TEST-SECRET-ID",
    R2_SECRET_ACCESS_KEY: "super-secret-value-123",
    APNS_KEY_ID: "APNSKEYID99",
    APNS_KEY_P8_BASE64: "cHJpdmF0ZS1rZXktc2VjcmV0",
  };
  const prior = Object.fromEntries(
    Object.keys(secrets).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, secrets);
  try {
    await assert.rejects(integrations(mk("customer", ["content"])), {
      status: 403,
    });
    const items = await integrations(mk("admin"));
    const text = JSON.stringify(items);
    for (const v of Object.values(secrets))
      assert.ok(!text.includes(v), "secret leaked: " + v.slice(0, 4));
    assert.equal(items.find((i) => i.id === "r2")?.ok, true);
    assert.equal(items.find((i) => i.id === "apns")?.ok, true);
    for (const i of items) {
      assert.equal(typeof i.ok, "boolean");
      assert.ok(i.label && i.what && i.note);
    }
  } finally {
    for (const [k, v] of Object.entries(prior))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});

test(
  "the activity log is for the full admin, filtered by kind and member, newest first, in pages",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { activityLog } = await import("../src/server/activity-log");
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const admin = mk("admin");
    const staff = mk("customer", ["producers"]);
    for (const u of [admin, staff])
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
        [u.id, u.name, u.phone, u.role, u.permissions],
      );
    try {
      const log = (actor: string, action: string, minutes: number) =>
        pool.query(
          "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details,created_at) VALUES($1,$2,$3,$4,now()-make_interval(mins=>$5))",
          [
            randomUUID(),
            actor,
            action,
            JSON.stringify({ n: minutes }),
            minutes,
          ],
        );
      for (let i = 0; i < 105; i++)
        await log(staff.id, "producer.review", i + 1);
      await log(admin.id, "backup.delete", 0);
      await assert.rejects(activityLog(staff, {}), { status: 403 });
      const mine = await activityLog(admin, { q: admin.name });
      assert.equal(mine.rows.length, 1);
      assert.equal(mine.rows[0].label, "حذف نسخة احتياطية");
      assert.equal(mine.rows[0].actorName, admin.name);
      // النوع: «الأسر والمندوبون»، أحدث 100 ثم الصفحة التالية.
      const first = await activityLog(admin, {
        group: "families",
        q: staff.name,
      });
      assert.equal(first.rows.length, 100);
      assert.equal(first.more, true);
      assert.ok(first.rows.every((r) => r.label === "قرار مراجعة أسرة"));
      assert.ok(
        Date.parse(first.rows[0].createdAt) >
          Date.parse(first.rows[99].createdAt),
      );
      const next = await activityLog(admin, {
        group: "families",
        q: staff.name,
        // كما يصل من المتصفح: نص التاريخ.
        before: new Date(first.rows[99].createdAt).toISOString(),
      });
      assert.equal(next.rows.length, 5);
      assert.equal(next.more, false);
      await assert.rejects(activityLog(admin, { group: "nope" }));
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id = ANY($1::uuid[])",
        [[admin.id, staff.id]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id = ANY($1::uuid[])", [
        [admin.id, staff.id],
      ]);
      await pool.end();
    }
  },
);
