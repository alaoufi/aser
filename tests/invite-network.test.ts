import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * «ادعُ صديقًا» على الآيفون (قرار المالك 2026-11-27): تطبيق الآيفون لا يرى ما حفظه Safari من رابط الدعوة.
 * فتح الرابط يُسجَّل ببصمة الشبكة، ومن يسجّل بلا رقم ولا رابط من الشبكة نفسها خلال ٢٤ ساعة يُحسب
 * لصاحب الدعوة إن كانت دعوة واحدة فقط منها. الرقم المكتوب والرابط المحفوظ يُقدَّمان دائمًا.
 */
test(
  "an iPhone app signup counts for the inviter who shared the same network within a day",
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
    const mk = async () => {
      const id = randomUUID();
      const phone =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      users.push(id);
      const no = (
        await pool.query<{ member_no: number }>(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'عضو',$2,'customer',now()) RETURNING member_no",
          [id, phone],
        )
      ).rows[0].member_no;
      return { id, code: String(no) };
    };
    const via = async (id: string) =>
      (
        await pool.query(
          "SELECT via,referrer_id FROM jdatna.referrals WHERE referred_id=$1",
          [id],
        )
      ).rows[0];
    const net = () => randomUUID().replace(/-/g, "").slice(0, 16);
    const record = (
      id: string,
      r: { invite?: string; link?: string; net?: string },
    ) => transaction((client) => ref.recordReferral(client, id, r));
    try {
      const host = await mk();
      const other = await mk();

      // ١) فتح الرابط ثم التسجيل من التطبيق بلا رقم: يُحسب بالشبكة.
      const home = net();
      await ref.recordInviteClick(host.code, home);
      await ref.recordInviteClick(host.code, home); // التكرار لا يضاعف.
      const a = await mk();
      assert.equal(await record(a.id, { net: home }), true);
      assert.deepEqual(await via(a.id), {
        via: "network",
        referrer_id: host.id,
      });

      // ٢) شبكة أخرى بلا فتح رابط: لا يُحسب.
      const b = await mk();
      assert.equal(await record(b.id, { net: net() }), false);

      // ٣) دعوتان مختلفتان من الشبكة نفسها: لا تُنسب لأحد.
      const shared = net();
      await ref.recordInviteClick(host.code, shared);
      await ref.recordInviteClick(other.code, shared);
      const c = await mk();
      assert.equal(await record(c.id, { net: shared }), false);

      // ٤) الرقم المكتوب يُقدَّم على الشبكة.
      const d = await mk();
      assert.equal(await record(d.id, { invite: other.code, net: home }), true);
      assert.equal((await via(d.id)).referrer_id, other.id);

      // ٥) بعد ٢٤ ساعة لا يُحسب، والصيانة تحذف البصمة.
      const old = net();
      await ref.recordInviteClick(host.code, old);
      await pool.query(
        "UPDATE jdatna.invite_clicks SET created_at=now()-interval '25 hours' WHERE net=$1",
        [old],
      );
      const e = await mk();
      assert.equal(await record(e.id, { net: old }), false);
      assert.ok(((await ref.cleanupInviteClicks()) ?? 0) >= 1);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.invite_clicks WHERE net=$1",
            [old],
          )
        ).rows[0].n,
        0,
      );

      // ٦) رقم غير صحيح لا يُسجَّل.
      await ref.recordInviteClick("9999998", net());
    } finally {
      await pool.query(
        "DELETE FROM jdatna.invite_clicks WHERE referrer_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query(
        "DELETE FROM jdatna.referrals WHERE referrer_id=ANY($1::uuid[]) OR referred_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
