import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { profileSchema } from "../src/server/validation";
import {
  saveProfile,
  reviewProducer,
  pendingApprovals,
} from "../src/server/management";
import { setPushTransport, subscribePush } from "../src/server/push";
import { siteTextDefaults } from "../src/lib/site-texts";
import { db } from "../src/server/db";
const profile = {
  nationalId: "1234567890",
  workLocation: "عنوان اختبار أهلية خاص ومعزول",
  name: "أسرة اختبار الاستثناء",
  cityId: "riyadh",
  phone: "0500000017",
  pickup: true,
  categoryIds: ["1"],
  documentType: "producer_certificate",
  documentId: null,
};
test("registration accepts no attachment; an old-style exception still needs its reason", () => {
  assert.equal(profileSchema.safeParse(profile).success, true);
  assert.equal(
    profileSchema.safeParse({ ...profile, documentType: "national_id" })
      .success,
    true,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, documentType: "exception" }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      documentType: "exception",
      exceptionReason: "طلب مراجعة أهلية النشاط بواسطة الإدارة",
    }).success,
    true,
  );
});
test(
  "admin activates a family without documents after explicit confirmation, never its own",
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
      // جهازا المدير والأسرة يلتقطان الإشعارات بدل الإرسال الحقيقي.
      const sent: {
        endpoint: string;
        payload: { title: string; body: string; url: string };
      }[] = [];
      setPushTransport(async (sub, payload) => {
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      });
      const device = (who: string) => ({
        endpoint: `https://push.invalid/${who}-${uid}`,
        keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
      });
      await subscribePush(admin, device("admin"));
      await subscribePush(user, device("family"));
      const reached = async (who: string, title: string) => {
        for (let i = 0; i < 50; i++) {
          const hit = sent.find(
            (x) =>
              x.endpoint.startsWith(`https://push.invalid/${who}-`) &&
              x.payload.title === title,
          );
          if (hit) return hit.payload;
          await new Promise((r) => setTimeout(r, 20));
        }
        return null;
      };
      const p = await saveProfile(user, { ...profile, cityId: city });
      pid = p.id;
      assert.equal(p.status, "pending");
      // كل تسجيل ينتظر الاعتماد ينبّه المشرف، ويظهر في عدّاد «اعتماد الأسر المنتجة».
      const alert = await reached("admin", "أسرة تنتظر الاعتماد");
      assert.equal(alert?.url, "/admin?tab=approvals");
      assert.ok((await pendingApprovals(admin)).count >= 1);
      await assert.rejects(pendingApprovals(user), { status: 403 });
      await assert.rejects(
        () =>
          reviewProducer({ ...user, role: "admin" }, p.id, {
            decision: "approved",
            reason: "تم التفعيل، نرجو إرفاق الشهادة",
            eligibilityConfirmed: true,
          }),
        /بنفسك/,
      );
      await assert.rejects(() =>
        reviewProducer(user, p.id, {
          decision: "approved",
          reason: "سبب مراجعة الاختبار",
          eligibilityConfirmed: true,
        }),
      );
      // التفعيل يحتاج تأكيدًا صريحًا من المراجع.
      await assert.rejects(() =>
        reviewProducer(admin, p.id, {
          decision: "approved",
          reason: "سبب مراجعة الاختبار",
        }),
      );
      // دون أي مستند: تفعّل الإدارة الحساب وتذكر النواقص في الملاحظة.
      await reviewProducer(admin, p.id, {
        decision: "approved",
        reason: "تم التفعيل. نرجو إرفاق شهادة الأسرة المنتجة",
        eligibilityConfirmed: true,
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
      // بعد الاعتماد تصل الأسرة مباركة نصها من «نصوص الموقع».
      const congrats = await reached(
        "family",
        siteTextDefaults["approval.title"],
      );
      assert.equal(congrats?.body, siteTextDefaults["approval.message"]);
      assert.equal(congrats?.url, "/dashboard");
      // إعادة الاعتماد بعد تعديل البيانات لا تكرر المباركة.
      await db().query(
        "UPDATE jdatna.producer_profiles SET status='pending' WHERE id=$1",
        [p.id],
      );
      const before = sent.length;
      await reviewProducer(admin, p.id, {
        decision: "approved",
        reason: "إعادة اعتماد بعد تعديل البيانات",
        eligibilityConfirmed: true,
      });
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(
        sent
          .slice(before)
          .filter((x) => x.payload.title === siteTextDefaults["approval.title"])
          .length,
        0,
      );
      assert.equal(
        audit.details.reason,
        "تم التفعيل. نرجو إرفاق شهادة الأسرة المنتجة",
      );
    } finally {
      setPushTransport(null);
      await db().query(
        "DELETE FROM jdatna.push_subscriptions WHERE user_id=ANY($1::uuid[])",
        [[uid, aid]],
      );
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
