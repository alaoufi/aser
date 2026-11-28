import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * قرارا المراجعة الجديدان (قرار المالك 2026-11-27):
 * - «تم استكمال المطلوب»: مكتمل الشروط (موثوق) بلا مهلة، والمنتجات المخفية لتأخر المستندات تعود.
 * - «يُستثنى من الشروط»: نشط مع نواقصه، ولا مهلة ولا تنبيه تأخر.
 * و«مستندات الأسر» في الإدارة: كل مستند لأسرته، لمن يراجع الأسر فقط.
 */
test(
  "complete and exempt decisions activate the family without a documents deadline; the documents list is for reviewers only",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const m = await import("../src/server/management");
    const { familyAccountState } = await import("../src/lib/family-status");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const users: string[] = [];
    const families: string[] = [];
    const mk = async (role: string) => {
      const u = { id: randomUUID(), name: role, phone: phone(), role };
      users.push(u.id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.name, u.phone, u.role],
      );
      return u as unknown as import("../src/lib/types").SessionUser;
    };
    const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
      .rows[0].id;
    const family = async (name: string) => {
      const owner = await mk("producer");
      const id = randomUUID();
      families.push(id);
      await pool.query(
        `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,docs_pledged_at,docs_due_at,docs_hidden_at)
         VALUES($1,$2,$3,$4,$5,$6,'approved',now()-interval '20 days',now()-interval '5 days',now())`,
        [id, owner.id, "review-" + id, name, city, owner.phone],
      );
      const product = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible,hidden_by) VALUES($1,$2,'طبق','وصف','طبق','available',false,'docs')",
        [product, id],
      );
      return { id, owner, product };
    };
    const row = async (id: string) =>
      (
        await pool.query(
          "SELECT status,docs_status,docs_due_at,docs_hidden_at FROM jdatna.producer_profiles WHERE id=$1",
          [id],
        )
      ).rows[0];
    try {
      const admin = await mk("admin");

      // ١) تم استكمال المطلوب.
      const a = await family(`مكتملة ${randomUUID().slice(0, 5)}`);
      const done = await m.reviewProducer(admin, a.id, {
        decision: "complete",
        reason: "",
        eligibilityConfirmed: true,
      });
      assert.equal(done.status, "approved");
      const ra = await row(a.id);
      assert.equal(ra.docs_status, "complete");
      assert.equal(ra.docs_due_at, null);
      assert.equal(ra.docs_hidden_at, null);
      assert.equal(
        (
          await pool.query("SELECT visible FROM jdatna.products WHERE id=$1", [
            a.product,
          ])
        ).rows[0].visible,
        true,
        "المنتج المخفي لتأخر المستندات يعود",
      );
      assert.equal(
        familyAccountState(
          { status: "approved", verified: true, docsStatus: "complete" },
          "2026-11-27",
        ).key,
        "trusted",
      );

      // ٢) يُستثنى من الشروط: لا تنبيه تأخر.
      const b = await family(`مستثناة ${randomUUID().slice(0, 5)}`);
      await m.reviewProducer(admin, b.id, {
        decision: "exempt",
        reason: "نقص مستند الأهلية",
        eligibilityConfirmed: true,
      });
      const rb = await row(b.id);
      assert.equal(rb.status, "approved");
      assert.equal(rb.docs_status, "exempt");
      assert.equal(rb.docs_due_at, null);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET docs_due_at=now()-interval '1 day' WHERE id=$1",
        [b.id],
      );
      await m.notifyLateDocuments(500);
      assert.equal(
        (
          await pool.query(
            "SELECT docs_late_notified_at FROM jdatna.producer_profiles WHERE id=$1",
            [b.id],
          )
        ).rows[0].docs_late_notified_at,
        null,
        "المستثناة لا تُنبَّه بمهلة",
      );
      // القرار المفعّل يحتاج تأكيد المراجعة.
      await assert.rejects(
        m.reviewProducer(admin, b.id, { decision: "complete", reason: "" }),
      );

      // ٣) «مستندات الأسر»: المستند يظهر لأسرته، وغير المراجع لا يراه.
      const doc = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'producer_certificate',$3,'application/pdf',2048)",
        [doc, a.owner.id, `test/${doc}`],
      );
      const list = await m.adminDocuments(admin, "مكتملة");
      const found = list.find((d) => d.id === doc);
      assert.ok(found);
      assert.equal(found?.producerId, a.id);
      assert.equal(found?.mime, "application/pdf");
      await assert.rejects(m.adminDocuments(a.owner), { status: 403 });
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE target_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_verifications WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_documents WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
