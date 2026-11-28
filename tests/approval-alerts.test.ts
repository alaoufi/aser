import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * «من يستقبل إشعارات الموافقات» (قرار المالك 2026-11-28): المدير العام يحدد من الإدارة
 * (المديرون وأصحاب صلاحية الاعتماد) من يصله إشعار تسجيل أسرة أو مندوب جديد.
 */
test(
  "the general manager chooses who receives approval notifications",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { approvalAlertRecipients, setApprovalAlert } =
      await import("../src/server/management");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const ids: string[] = [];
    const mk = async (role: string, permissions: string[] = []) => {
      const id = randomUUID();
      ids.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at,permissions) VALUES($1,$2,'مستقبل',$3,now(),$4)",
        [
          id,
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
          role,
          permissions,
        ],
      );
      return { id, role, name: "مستقبل", phone: "" } as never as {
        id: string;
        role: "admin";
      };
    };
    try {
      const boss = await mk("admin");
      const approver = await mk("customer", ["approvals"]);
      const customer = await mk("customer");
      const list = await approvalAlertRecipients(boss as never);
      const mine = list.filter((r) => ids.includes(r.id));
      assert.deepEqual(
        mine.map((r) => r.id).sort(),
        [boss.id, approver.id].sort(),
      );
      assert.ok(
        mine.every((r) => r.on),
        "الكل يستقبل افتراضيًا",
      );
      // صاحب صلاحية الاعتماد لا يغيّر الإعداد؛ المدير العام فقط.
      await assert.rejects(approvalAlertRecipients(approver as never), {
        status: 403,
      });
      await assert.rejects(
        setApprovalAlert(approver as never, { id: boss.id, on: false }),
        { status: 403 },
      );
      // العميل ليس من الإدارة.
      await assert.rejects(
        setApprovalAlert(boss as never, { id: customer.id, on: true }),
        { status: 404 },
      );
      await setApprovalAlert(boss as never, { id: approver.id, on: false });
      const after = await approvalAlertRecipients(boss as never);
      assert.equal(after.find((r) => r.id === approver.id)?.on, false);
      assert.equal(after.find((r) => r.id === boss.id)?.on, true);
      // استعلام الإشعار نفسه يستثني من أُوقف عنه.
      const notified = (
        await pool.query(
          `SELECT id FROM jdatna.users WHERE (role='admin' OR 'approvals'=ANY(permissions))
             AND approval_alerts AND suspended_at IS NULL AND deleted_at IS NULL AND id=ANY($1::uuid[])`,
          [ids],
        )
      ).rows.map((r) => r.id);
      assert.deepEqual(notified, [boss.id]);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
    }
  },
);
