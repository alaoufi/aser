import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";

/**
 * «ادعُ صديقًا» (قرار المالك 2026-11-22): يُحسب المسجل لصاحب الدعوة بالرابط أو برقمه، مرة واحدة لكل
 * حساب، ولا يدعو أحد نفسه. الرصيد عدد فقط. والإدارة ترى الأرصدة ومن سجلوا لمن أُعطي القسم فقط.
 */
test(
  "referrals count once per verified account, never self, and only the invites section sees them",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db, transaction } = await import("../src/server/db");
    const ref = await import("../src/server/referrals");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const users: string[] = [];
    const mk = async (role = "customer", permissions: string[] = []) => {
      const id = randomUUID();
      const phone =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      users.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
        [id, "عضو " + users.length, phone, role, permissions],
      );
      return { id, name: "عضو", phone, role, permissions } as SessionUser;
    };
    try {
      const host = await mk();
      const { code, link, count } = await ref.myInvite(host);
      assert.match(code, ref.codePattern);
      assert.equal(link, `https://jdtna.sa/r/${code}`);
      assert.equal(count, 0);
      assert.equal((await ref.myInvite(host)).code, code, "الرمز ثابت");
      assert.equal(await ref.validInviteCode(code), true);
      assert.equal(await ref.validInviteCode("zzzzzzz"), false);

      const a = await mk();
      const b = await mk();
      const c = await mk();
      const record = (id: string, r: { code?: string; phone?: string }) =>
        transaction((client) => ref.recordReferral(client, id, r));
      assert.equal(await record(a.id, { code }), true, "بالرابط");
      assert.equal(await record(a.id, { code }), false, "مرة واحدة فقط");
      // رقم الداعي بأي صيغة، ويُقدَّم على الرابط.
      assert.equal(
        await record(b.id, { phone: "0" + host.phone.slice(4) }),
        true,
      );
      assert.equal(await record(host.id, { code }), false, "لا يدعو نفسه");
      assert.equal(await record(c.id, { phone: "0500000000" }), false);
      assert.equal(await record(c.id, { phone: "abc" }), false);
      assert.equal((await ref.myInvite(host)).count, 2);

      // الإدارة: المدير العام ومن أُعطي القسم فقط.
      const admin = await mk("admin");
      const staff = await mk("customer", ["invites"]);
      const other = await mk("customer", ["orders"]);
      await assert.rejects(ref.adminReferrers(other), { status: 403 });
      for (const who of [admin, staff]) {
        const row = (await ref.adminReferrers(who)).find(
          (r) => r.id === host.id,
        );
        assert.equal(row?.count, 2);
        assert.equal(row?.byLink, 1);
        assert.equal(row?.byPhone, 1);
      }
      const detail = await ref.adminReferred(staff, host.id);
      assert.deepEqual(
        detail.people.map((p) => p.phone).sort(),
        [a.phone, b.phone].sort(),
      );
      assert.deepEqual(detail.people.map((p) => p.via).sort(), [
        "link",
        "phone",
      ]);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.referrals WHERE referrer_id=ANY($1::uuid[]) OR referred_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query(
        "DELETE FROM jdatna.referral_codes WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
