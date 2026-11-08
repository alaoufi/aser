import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { profileSchema } from "../src/server/validation";
import { saveProfile, reviewProducer } from "../src/server/management";
import { db } from "../src/server/db";
const profile = {
  nationalId: "1234567890",
  workLocation: "عنوان اختبار أهلية خاص ومعزول",
  name: "أسرة اختبار الاستثناء",
  cityId: "riyadh",
  phone: "0500000017",
  pickup: true,
  categoryIds: ["1"],
  documentType: "exception",
  documentId: null,
  exceptionReason: "طلب مراجعة أهلية النشاط بواسطة الإدارة",
};
test("only exception applications can omit a document and must explain why", () => {
  assert.equal(profileSchema.safeParse(profile).success, true);
  assert.equal(
    profileSchema.safeParse({ ...profile, exceptionReason: "" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, documentType: "freelance" }).success,
    false,
  );
});
test(
  "admin exception requires explicit confirmation and keeps pending application private",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const database = (await db().query("SELECT current_database() AS n"))
      .rows[0].n;
    assert.ok(database.startsWith("jdatna_test_"));
    const uid = randomUUID(),
      aid = randomUUID();
    let pid: string | undefined;
    try {
      await db().query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,'+966500000017','test','customer',now()),($2,'+966500000018','admin','admin',now())",
        [uid, aid],
      );
      const user = {
        id: uid,
        name: "test",
        phone: "+966500000017",
        role: "customer" as const,
      };
      const admin = {
        id: aid,
        name: "admin",
        phone: "+966500000018",
        role: "admin" as const,
      };
      const city = (await db().query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      const p = await saveProfile(user, { ...profile, cityId: city });
      pid = p.id;
      assert.equal(p.status, "pending");
      await assert.rejects(
        () =>
          reviewProducer({ ...user, role: "admin" }, p.id, {
            decision: "approved",
            reason: "استثناء موثق بعد مراجعة أهلية الأسرة",
            eligibilityConfirmed: true,
            exceptionApproved: true,
          }),
        /بنفسك/,
      );
      await assert.rejects(() =>
        reviewProducer(user, p.id, {
          decision: "approved",
          reason: "سبب مراجعة الاختبار",
          eligibilityConfirmed: true,
          exceptionApproved: true,
        }),
      );
      await assert.rejects(() =>
        reviewProducer(admin, p.id, {
          decision: "approved",
          reason: "سبب مراجعة الاختبار",
          eligibilityConfirmed: true,
        }),
      );
      await reviewProducer(admin, p.id, {
        decision: "approved",
        reason: "استثناء موثق بعد مراجعة أهلية الأسرة",
        eligibilityConfirmed: true,
        exceptionApproved: true,
      });
      assert.equal(
        (
          await db().query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=$1",
            [p.id],
          )
        ).rows[0].status,
        "approved",
      );
      const audit = (
        await db().query(
          "SELECT details FROM jdatna.admin_audit_logs WHERE target_id=$1 AND action='producer.review'",
          [p.id],
        )
      ).rows[0];
      assert.equal(audit.details.exceptionApproved, true);
    } finally {
      if (pid) {
        await db().query(
          "DELETE FROM jdatna.admin_audit_logs WHERE target_id=$1",
          [pid],
        );
        await db().query(
          "DELETE FROM jdatna.producer_verifications WHERE producer_id=$1",
          [pid],
        );
        await db().query(
          "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
          [pid],
        );
        await db().query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          pid,
        ]);
      }
      await db().query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [uid, aid],
      ]);
      await db().end();
    }
  },
);
