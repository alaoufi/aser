import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";

/**
 * أرقام الأعضاء و«ادعُ صديقًا» (قرار المالك 2026-11-22):
 * - رقم داخلي من 6 أرقام ثابت، ورقم عضو معروض بالتسلسل من 100 يتجاوز المحجوز (11…99، 111…999، 1111…، 2030).
 * - الإدارة تغيّر الرقم لرقم متاح (ولو محجوزًا)، والقديم يبقى لصاحبه ولا يُعطى لغيره.
 * - الدعوة برابط /r/رقم العضو أو بكتابة «رقم الدعوة» (رقم العضو أو جواله): مرة واحدة لكل حساب،
 *   ولا يدعو أحد نفسه. الرصيد عدد فقط، والإدارة ترى الأرصدة لمن أُعطي القسم فقط.
 */
test(
  "member numbers skip reserved ones, the admin can change them, and invites count by number",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db, transaction } = await import("../src/server/db");
    const ref = await import("../src/server/referrals");
    const { updateMember } = await import("../src/server/members");
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
      const r = (
        await pool.query<{ member_no: number; internal_no: number }>(
          "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING member_no,internal_no",
          [id, "عضو " + users.length, phone, role, permissions],
        )
      ).rows[0];
      return {
        id,
        name: "عضو",
        phone,
        role,
        permissions,
        memberNo: r.member_no,
        internalNo: r.internal_no,
      } as SessionUser & { memberNo: number; internalNo: number };
    };
    const reserved = async (n: number) =>
      (
        await pool.query<{ r: boolean }>(
          "SELECT jdatna.member_no_reserved($1) AS r",
          [n],
        )
      ).rows[0].r;
    try {
      // المحجوز عن التسجيل.
      for (const n of [11, 55, 99, 111, 777, 999, 1111, 9999, 2030])
        assert.equal(await reserved(n), true, `${n} محجوز`);
      for (const n of [100, 101, 112, 1000, 2031, 11111, 1212])
        assert.equal(await reserved(n), false, `${n} غير محجوز`);

      const host = await mk();
      assert.ok(host.memberNo >= 100);
      assert.equal(await reserved(host.memberNo), false);
      assert.ok(host.internalNo >= 100001 && host.internalNo <= 999999);
      const next = await mk();
      assert.ok(next.memberNo > host.memberNo, "بالتسلسل");
      assert.ok(next.internalNo > host.internalNo);

      // التسلسل يتجاوز المحجوز: لو كان آخر رقم 1110 فالتالي 1112.
      const jump = await mk();
      // أقرب رقم محجوز (متشابه الأرقام) بعد آخر رقم مستعمل، ونضع عضوًا قبله مباشرة.
      let rep = (
        await pool.query<{ n: number }>(
          "SELECT greatest(max(u.member_no),coalesce((SELECT max(member_no) FROM jdatna.member_no_history),0))+1 AS n FROM jdatna.users u",
        )
      ).rows[0].n;
      while (!/^(\d)\1+$/.test(String(rep))) rep++;
      const base = rep - 1;
      await pool.query("UPDATE jdatna.users SET member_no=$2 WHERE id=$1", [
        jump.id,
        base,
      ]);
      const after = await mk();
      assert.equal(after.memberNo, base + 2, `بعد ${base} يأتي ${base + 2}`);

      // رابط الدعوة برقم العضو.
      const { memberNo, link, count } = await ref.myInvite(host);
      assert.equal(memberNo, host.memberNo);
      assert.equal(link, `https://jdtna.sa/r/${host.memberNo}`);
      assert.equal(count, 0);
      assert.equal(await ref.validInvite(String(host.memberNo)), true);
      assert.equal(await ref.validInvite("abc"), false);

      // الإدارة تغيّر الرقم لرقم مميز متاح، والقديم يبقى له.
      const admin = await mk("admin");
      const old = host.memberNo;
      let special = 0;
      for (const n of [22, 33, 44, 66, 77, 88, 5, 7, 9]) {
        const used = (
          await pool.query(
            "SELECT 1 FROM jdatna.users WHERE member_no=$1 UNION ALL SELECT 1 FROM jdatna.member_no_history WHERE member_no=$1",
            [n],
          )
        ).rowCount;
        if (!used) {
          special = n;
          break;
        }
      }
      assert.ok(special, "رقم مميز متاح للاختبار");
      await updateMember(admin, {
        action: "number",
        id: host.id,
        memberNo: special,
      });
      assert.equal((await ref.myInvite(host)).memberNo, special);
      // الرقم المأخوذ أو القديم لعضو آخر غير متاح.
      await assert.rejects(
        updateMember(admin, {
          action: "number",
          id: next.id,
          memberNo: special,
        }),
        { status: 409 },
      );
      await assert.rejects(
        updateMember(admin, { action: "number", id: next.id, memberNo: old }),
        { status: 409 },
      );
      // غير المدير العام لا يغيّر الأرقام.
      const staff = await mk("customer", ["invites"]);
      await assert.rejects(
        updateMember(staff, {
          action: "number",
          id: next.id,
          memberNo: 123456,
        }),
        { status: 403 },
      );

      const a = await mk();
      const b = await mk();
      const c = await mk();
      const d = await mk();
      const record = (id: string, r: { invite?: string; link?: string }) =>
        transaction((client) => ref.recordReferral(client, id, r));
      // الرابط القديم (الرقم قبل التغيير) يصل لصاحبه.
      assert.equal(await record(a.id, { link: String(old) }), true, "بالرابط");
      assert.equal(
        await record(a.id, { link: String(special) }),
        false,
        "مرة واحدة فقط",
      );
      // «رقم الدعوة» برقم العضو (ولو بالأرقام العربية) يُقدَّم على الرابط.
      const arabic = String(special).replace(/\d/g, (x) => "٠١٢٣٤٥٦٧٨٩"[+x]);
      assert.equal(
        await record(b.id, { invite: arabic, link: String(next.memberNo) }),
        true,
      );
      // أو بجواله بأي صيغة.
      assert.equal(
        await record(c.id, { invite: "0" + host.phone.slice(4) }),
        true,
      );
      assert.equal(
        await record(host.id, { link: String(special) }),
        false,
        "لا يدعو نفسه",
      );
      assert.equal(await record(d.id, { invite: "0500000000" }), false);
      assert.equal(await record(d.id, { invite: "abc" }), false);
      assert.equal((await ref.myInvite(host)).count, 3);

      // الإدارة: المدير العام ومن أُعطي القسم فقط.
      const other = await mk("customer", ["orders"]);
      await assert.rejects(ref.adminReferrers(other), { status: 403 });
      for (const who of [admin, staff]) {
        const row = (await ref.adminReferrers(who)).find(
          (r) => r.id === host.id,
        );
        assert.equal(row?.count, 3);
        assert.equal(row?.byLink, 1);
        assert.equal(row?.byNumber, 2);
        assert.equal(row?.memberNo, special);
      }
      const detail = await ref.adminReferred(staff, host.id);
      assert.deepEqual(
        detail.people.map((p) => p.phone).sort(),
        [a.phone, b.phone, c.phone].sort(),
      );
      assert.deepEqual(detail.people.map((p) => p.via).sort(), [
        "link",
        "number",
        "phone",
      ]);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
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
