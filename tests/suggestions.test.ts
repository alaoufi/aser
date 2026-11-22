import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  adminSuggestions,
  manageSuggestion,
  submitSuggestion,
} from "../src/server/suggestions";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated suggestions: anyone sends, only the full admin reads, marks read and deletes",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const mk = (role: SessionUser["role"], permissions: string[] = []) => ({
      id: randomUUID(),
      name: "عضو " + role,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
      permissions,
    });
    const member = mk("customer"),
      staff = mk("staff", ["reports", "template"]),
      admin = mk("admin");
    const users = [member, staff, admin];
    const tag = randomUUID();
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,permissions) VALUES($1,$2,$3,$4,now(),$5)",
          [u.id, u.name, u.phone, u.role, u.permissions],
        );
      // زائر بلا حساب، وعضو (اسمه وجواله من حسابه).
      await submitSuggestion(null, {
        body: "زائر يقترح " + tag,
        name: "زائر كريم",
        contact: "0500000000",
      });
      await submitSuggestion(member, { body: "عضو يقترح " + tag });
      await assert.rejects(submitSuggestion(null, { body: "قص" }));
      // القراءة للمدير وحده، لا للعضو ولا للمشرف.
      await assert.rejects(adminSuggestions(member), { status: 403 });
      await assert.rejects(adminSuggestions(staff), { status: 403 });
      const mine = (await adminSuggestions(admin)).filter((x) =>
        String(x.body).endsWith(tag),
      );
      assert.equal(mine.length, 2);
      const fromMember = mine.find((x) => x.body.startsWith("عضو"))!;
      assert.equal(fromMember.name, member.name);
      assert.equal(fromMember.contact, member.phone);
      assert.equal(fromMember.readAt, null);
      await assert.rejects(
        manageSuggestion(staff, { id: fromMember.id, action: "read" }),
        { status: 403 },
      );
      await manageSuggestion(admin, { id: fromMember.id, action: "read" });
      await manageSuggestion(admin, {
        id: mine[0].id === fromMember.id ? mine[1].id : mine[0].id,
        action: "delete",
      });
      const left = (await adminSuggestions(admin)).filter((x) =>
        String(x.body).endsWith(tag),
      );
      assert.equal(left.length, 1);
      assert.ok(left[0].readAt);
    } finally {
      await pool.query("DELETE FROM jdatna.suggestions WHERE body LIKE $1", [
        "%" + tag,
      ]);
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE 'suggestions%'",
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
    }
  },
);
