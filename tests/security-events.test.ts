import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { rateLimit } from "../src/server/auth";
import {
  clientIp,
  mask,
  recordSecurityEvent,
  securityOverview,
  sourceKey,
} from "../src/server/security-events";
import type { SessionUser } from "../src/lib/types";

const req = (xff?: string) =>
  new Request("https://jdatna.com/api/auth/password-login", {
    method: "POST",
    headers: xff ? { "x-forwarded-for": xff } : {},
  });

test("the visitor address is the one Caddy appended, never a spoofed earlier value", () => {
  assert.equal(clientIp(req("203.0.113.9")), "203.0.113.9");
  // ما أرسله الزائر يسبق ما أضافه Caddy؛ المعتمد آخر قيمة.
  assert.equal(clientIp(req("1.1.1.1, 198.51.100.7")), "198.51.100.7");
  assert.equal(clientIp(req("2001:db8::1")), "2001:db8::1");
  assert.equal(clientIp(req("not-an-ip")), null);
  assert.equal(clientIp(req()), null);
  assert.equal(sourceKey(req()), null);
  // التمويه ثابت وقصير ولا يحوي العنوان.
  assert.match(mask("ip:203.0.113.9"), /^[a-f0-9]{16}$/);
  assert.equal(mask("ip:203.0.113.9"), mask("ip:203.0.113.9"));
  assert.notEqual(mask("ip:203.0.113.9"), mask("ip:203.0.113.10"));
  assert.equal(sourceKey(req("203.0.113.9")), mask("ip:203.0.113.9"));
});

test(
  "security log: failed logins from one source are flagged, only the owner reads it, and a rate-limit breach is logged once",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const tag = randomUUID();
    const admin: SessionUser = {
      id: randomUUID(),
      name: "مدير",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "admin",
    };
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'admin',now())",
        [admin.id, admin.name, admin.phone],
      );
      for (let i = 0; i < 6; i++)
        await recordSecurityEvent("login.failed", {
          request: req(ip),
          subject: `victim-${tag}`,
          detail: "كلمة مرور خاطئة",
        });
      const stored = (
        await pool.query(
          "SELECT source,subject,detail FROM jdatna.security_events WHERE source=$1",
          [mask(`ip:${ip}`)],
        )
      ).rows;
      assert.equal(stored.length, 6);
      // لا العنوان ولا الحساب نصًّا في السجل.
      assert.ok(stored.every((r) => !JSON.stringify(r).includes(ip)));
      assert.ok(stored.every((r) => !JSON.stringify(r).includes(tag)));
      const view = await securityOverview(admin);
      assert.ok(
        view.suspicious.some(
          (s) =>
            s.by === "source" && s.key === mask(`ip:${ip}`) && s.count >= 6,
        ),
      );
      assert.ok(
        view.suspicious.some(
          (s) => s.by === "account" && s.key === mask(`subject:victim-${tag}`),
        ),
      );
      assert.ok(
        view.summary.some((s) => s.kind === "login.failed" && s.count >= 6),
      );
      for (const role of ["customer", "producer", "courier"] as const)
        await assert.rejects(securityOverview({ ...admin, role }), {
          status: 403,
        });
      // تجاوز حد المحاولات يُسجَّل مرة واحدة في النافذة مهما تكرر.
      const key = `sec-test-${tag}:x`;
      await rateLimit(key, 1, 60);
      for (let i = 0; i < 3; i++)
        await assert.rejects(rateLimit(key, 1, 60), { status: 429 });
      const breaches = (
        await pool.query(
          "SELECT count(*)::int AS n FROM jdatna.security_events WHERE kind='rate_limited' AND detail=$1",
          [`sec-test-${tag}`],
        )
      ).rows[0].n;
      assert.equal(breaches, 1);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.security_events WHERE source=$1 OR detail=$2",
        [mask(`ip:${ip}`), `sec-test-${tag}`],
      );
      await pool.query("DELETE FROM jdatna.rate_limits WHERE key LIKE $1", [
        `sec-test-${tag}%`,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [admin.id]);
    }
  },
);
