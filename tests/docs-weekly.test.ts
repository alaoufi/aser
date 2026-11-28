import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * التذكير الأسبوعي (قرار المالك 2026-11-28): الأسرة ذات المهلة أو المستثناة، ولم ترفع مستنداتها،
 * تصلها رسالة لطيفة كل أسبوع، ويصل الإدارةَ تنبيه بتاريخ التسجيل والمهلة. مرة في الأسبوع فقط.
 */
test(
  "families on a grace period or exempt get a gentle weekly reminder, and the admins are told",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const push = await import("../src/server/push");
    const { remindPendingDocuments } = await import("../src/server/management");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    push.setPushTransport(async () => {});
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const users: string[] = [];
    const families: string[] = [];
    const tag = randomUUID().slice(0, 6);
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
      )
    ).rows[0].id;
    const mkUser = async (role: string) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [id, phone(), role, role],
      );
      users.push(id);
      return id;
    };
    const mkFamily = async (
      name: string,
      docsStatus: string | null,
      due: string | null,
    ) => {
      const owner = await mkUser("producer");
      const id = randomUUID();
      await pool.query(
        `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,docs_status,docs_due_at,created_at)
         VALUES($1,$2,$3,$4,$5,'+966500000099','approved',$6,${due ?? "NULL"},now()-interval '20 days')`,
        [id, owner, `weekly-${id}`, name, city, docsStatus],
      );
      // اعتُمدت قبل ٨ أيام.
      await pool.query(
        "INSERT INTO jdatna.producer_verifications(id,producer_id,document_type,decision,created_at) VALUES($1,$2,'exception','approved',now()-interval '8 days')",
        [randomUUID(), id],
      );
      families.push(id);
      return { id, owner };
    };
    try {
      const admin = await mkUser("admin");
      const grace = await mkFamily(
        `مهلة ${tag}`,
        null,
        "now()+interval '7 days'",
      );
      const exempt = await mkFamily(`مستثناة ${tag}`, "exempt", null);
      const complete = await mkFamily(`مكتملة ${tag}`, "complete", null);
      const fresh = await mkFamily(
        `حديثة ${tag}`,
        null,
        "now()+interval '14 days'",
      );
      // اعتُمدت اليوم: أول تذكير بعد أسبوع.
      await pool.query(
        "UPDATE jdatna.producer_verifications SET created_at=now() WHERE producer_id=$1",
        [fresh.id],
      );
      const sent = await remindPendingDocuments(500);
      assert.ok(sent >= 2);
      const notes = async (userId: string) =>
        (
          await pool.query(
            "SELECT title,body,url FROM jdatna.notifications WHERE user_id=$1 ORDER BY created_at",
            [userId],
          )
        ).rows as { title: string; body: string; url: string }[];
      const g = await notes(grace.owner);
      assert.equal(g.length, 1);
      assert.match(g[0].body, /^شريكنا العزيز، ننتظر إكمال طلبات التسجيل/);
      assert.match(g[0].body, /للإيقاف/);
      const e = await notes(exempt.owner);
      assert.equal(e.length, 1);
      assert.doesNotMatch(e[0].body, /الإيقاف/, "المستثناة بلا ذكر الإيقاف");
      assert.equal((await notes(complete.owner)).length, 0);
      assert.equal((await notes(fresh.owner)).length, 0);
      // الإدارة: تنبيه لكل أسرة بتاريخ التسجيل والمهلة، ورابط بطاقتها.
      const a = await notes(admin);
      const ga = a.find((n) => n.body.includes(`مهلة ${tag}`));
      assert.ok(ga);
      assert.match(ga.body, /سجلت بتاريخ .+ والمهلة إلى .+ سوف تُوقف/);
      assert.equal(ga.url, `/admin/producers?family=${grace.id}`);
      const ea = a.find((n) => n.body.includes(`مستثناة ${tag}`));
      assert.ok(ea);
      assert.match(ea.body, /مستثناة من الشروط/);
      // مرة في الأسبوع فقط.
      await remindPendingDocuments(500);
      assert.equal((await notes(grace.owner)).length, 1);
      // بعد أسبوع: تذكير جديد.
      await pool.query(
        "UPDATE jdatna.producer_docs_reminders SET sent_at=now()-interval '8 days' WHERE producer_id=$1",
        [grace.id],
      );
      await remindPendingDocuments(500);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.notifications WHERE user_id=$1",
            [grace.owner],
          )
        ).rows[0].n,
        1,
        "الوسم نفسه يستبدل غير المقروء",
      );
      const last = (
        await pool.query(
          "SELECT sent_at > now()-interval '1 minute' AS recent FROM jdatna.producer_docs_reminders WHERE producer_id=$1",
          [grace.id],
        )
      ).rows[0];
      assert.equal(last.recent, true);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.producer_verifications WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
    }
  },
);
