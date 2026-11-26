import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { notifyLateDocuments, saveProfile } from "../src/server/management";
import { setPushTransport, subscribePush } from "../src/server/push";
import { db } from "../src/server/db";

/**
 * قرار المالك 2026-11-26: الأسرة تتعهد بتقديم المستندات الرسمية خلال 15 يومًا، فتُعطى كل صلاحيات
 * الأسرة المنتجة فورًا (تظهر للعملاء). المستند الجديد لا يُخفيها. بعد المدة بلا مستند: تنبيه الإدارة فقط.
 */
test(
  "a pledge to submit documents within 15 days approves the family at once; late ones alert the admin only",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = async (role: "customer" | "admin") => {
      const u = { id: randomUUID(), name: role, phone: phone(), role };
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.phone, u.name, u.role],
      );
      return u;
    };
    const users: string[] = [];
    const producers: string[] = [];
    const sent: { endpoint: string; title: string; body: string }[] = [];
    setPushTransport(async (sub, payload) => {
      const p = JSON.parse(payload);
      sent.push({ endpoint: sub.endpoint, title: p.title, body: p.body });
    });
    const reached = async (title: string, name: string) => {
      for (let i = 0; i < 50; i++) {
        if (sent.some((x) => x.title === title && x.body.includes(name)))
          return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    };
    try {
      const admin = await mk("admin");
      users.push(admin.id);
      await subscribePush(admin, {
        endpoint: `https://push.invalid/pledge-admin-${admin.id}`,
        keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
      });
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      const category = (
        await pool.query("SELECT id FROM jdatna.categories LIMIT 1")
      ).rows[0].id;
      const form = (u: { phone: string }, tradeName: string) => ({
        nationalId: "1234567890",
        workLocation: "عنوان اختبار التعهد الخاص",
        name: "أسرة التعهد",
        tradeName,
        cityId: city,
        phone: u.phone,
        pickup: true,
        categoryIds: [category],
        documentType: "producer_certificate",
        documentId: null,
      });
      const tag = randomUUID().slice(0, 6);

      // 1) التعهد: معتمدة فورًا، وموعد المستندات بعد 15 يومًا، وتنبيه للإدارة.
      const pledged = await mk("customer");
      users.push(pledged.id);
      const name1 = `شاهي التعهد ${tag}`;
      const p1 = await saveProfile(pledged, {
        ...form(pledged, name1),
        pledge: true,
      });
      producers.push(p1.id);
      assert.equal(p1.status, "approved");
      const row = (
        await pool.query(
          "SELECT status,docs_pledged_at,EXTRACT(EPOCH FROM docs_due_at-docs_pledged_at)/86400 AS days FROM jdatna.producer_profiles WHERE id=$1",
          [p1.id],
        )
      ).rows[0];
      assert.equal(row.status, "approved");
      assert.ok(row.docs_pledged_at);
      assert.equal(Math.round(Number(row.days)), 15);
      assert.equal(
        (
          await pool.query(
            "SELECT decision FROM jdatna.producer_verifications WHERE producer_id=$1 ORDER BY created_at DESC LIMIT 1",
            [p1.id],
          )
        ).rows[0].decision,
        "approved",
      );
      assert.ok(await reached("أسرة جديدة بتعهد المستندات", name1));
      // صار حساب أسرة.
      assert.equal(
        (
          await pool.query("SELECT role FROM jdatna.users WHERE id=$1", [
            pledged.id,
          ])
        ).rows[0].role,
        "producer",
      );

      // 2) بلا تعهد ولا مستند: ينتظر الاعتماد كما كان.
      const plain = await mk("customer");
      users.push(plain.id);
      const p2 = await saveProfile(plain, form(plain, `بلا تعهد ${tag}`));
      producers.push(p2.id);
      assert.equal(p2.status, "pending");

      // 3) المعتمدة بالتعهد ترفع مستندًا: تبقى ظاهرة، وتُنبَّه الإدارة لمراجعته.
      const doc = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'producer_certificate',$3,'application/pdf',1000)",
        [doc, pledged.id, `test/${doc}`],
      );
      const p1b = await saveProfile(pledged, {
        ...form(pledged, name1),
        documentId: doc,
      });
      assert.equal(p1b.status, "approved", "المستند لا يُخفي الأسرة");
      assert.ok(await reached("مستند أسرة للمراجعة", name1));

      // 4) تغيير الاسم التجاري لأسرة اعتُمدت يعيدها للمراجعة، والتعهد لا يتجاوز ذلك.
      const renamed = await saveProfile(pledged, {
        ...form(pledged, `${name1} الجديد`),
        documentId: doc,
        pledge: true,
      });
      assert.equal(renamed.status, "pending");

      // 5) مضت المدة بلا مستند: تنبيه الإدارة مرة واحدة، والأسرة تبقى معتمدة ظاهرة.
      const late = await mk("customer");
      users.push(late.id);
      const name3 = `متأخرة ${tag}`;
      const p3 = await saveProfile(late, {
        ...form(late, name3),
        pledge: true,
      });
      producers.push(p3.id);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET docs_due_at=now()-interval '1 day' WHERE id=$1",
        [p3.id],
      );
      assert.ok((await notifyLateDocuments(500)) >= 1);
      assert.ok(await reached("أسرة تأخرت في المستندات", name3));
      const after = (
        await pool.query(
          "SELECT status,docs_late_notified_at FROM jdatna.producer_profiles WHERE id=$1",
          [p3.id],
        )
      ).rows[0];
      assert.equal(after.status, "approved");
      assert.ok(after.docs_late_notified_at);
      const before = sent.filter((x) => x.body.includes(name3)).length;
      await notifyLateDocuments(500);
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        sent.filter((x) => x.body.includes(name3)).length,
        before,
        "مرة واحدة فقط",
      );
    } finally {
      setPushTransport(null);
      await pool.query(
        "DELETE FROM jdatna.push_subscriptions WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      for (const table of [
        "producer_verifications",
        "producer_categories",
        "producer_private",
      ])
        await pool.query(
          `DELETE FROM jdatna.${table} WHERE producer_id=ANY($1::uuid[])`,
          [producers],
        );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producers],
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
