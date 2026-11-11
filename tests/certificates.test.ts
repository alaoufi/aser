import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { rate } from "../src/server/ratings";
import {
  awardIfEligible,
  familyCertificate,
  getCertificate,
} from "../src/server/certificates";

test(
  "isolated certificates: ten five-star ratings award one certificate that stays; any lower rating before blocks it",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "customer" | "producer" | "admin", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
      permissions: [] as string[],
    });
    const owner = mk("producer", "صاحبة المطبخ"),
      other = mk("producer", "أسرة ثانية"),
      admin = mk("admin", "مدير الشهادات");
    const raters = Array.from({ length: 11 }, (_, i) =>
      mk("customer", `مقيّم ${i}`),
    );
    const users = [owner, other, admin, ...raters];
    const familyId = randomUUID(),
      otherId = randomUUID();
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      for (const [id, u] of [
        [familyId, owner],
        [otherId, other],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [id, u.id, "cert-" + id, u.name, city, u.phone],
        );
      const give = (target: string, rater: string, stars: number) =>
        pool.query(
          "INSERT INTO jdatna.ratings(id,kind,target_id,rater_id,rater_role,stars,comment) VALUES($1,'family',$2,$3,'member',$4,'')",
          [randomUUID(), target, rater, stars],
        );
      const certOf = async (id: string) =>
        (
          await pool.query(
            "SELECT id,family_name FROM jdatna.certificates WHERE producer_id=$1",
            [id],
          )
        ).rows[0];

      // تسعة تقييمات بخمس نجوم لا تكفي.
      for (const r of raters.slice(0, 9)) await give(familyId, r.id, 5);
      assert.equal(await awardIfEligible(familyId), null);
      assert.equal(await certOf(familyId), undefined);
      let mine = await familyCertificate(owner);
      assert.deepEqual(mine.progress, { total: 9, allFive: true, needed: 10 });
      assert.equal(mine.certificate, null);

      // العاشر (من الإدارة عبر التقييم نفسه) يُصدر الشهادة تلقائيًا.
      await rate(admin, {
        kind: "family",
        target: familyId,
        stars: 5,
        oath: true,
      });
      const cert = await certOf(familyId);
      assert.ok(cert, "certificate issued on the tenth five-star rating");
      assert.equal(cert.family_name, "صاحبة المطبخ");

      // تقييم أقل بعدها لا يسحب الشهادة، ولا تتكرر.
      await give(familyId, raters[9].id, 4);
      await awardIfEligible(familyId);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.certificates WHERE producer_id=$1",
            [familyId],
          )
        ).rows[0].n,
        1,
      );
      mine = await familyCertificate(owner);
      assert.equal(mine.certificate?.id, cert.id);
      const pub = await getCertificate(cert.id);
      assert.equal(pub?.familyName, "صاحبة المطبخ");
      assert.equal(pub?.producerSlug, "cert-" + familyId);
      assert.equal(await getCertificate("not-a-uuid"), null);

      // أسرة فيها تقييم واحد أقل من خمس قبل العاشر لا تحصل عليها.
      for (const r of raters.slice(0, 9)) await give(otherId, r.id, 5);
      await give(otherId, raters[10].id, 4);
      assert.equal(await awardIfEligible(otherId), null);
      assert.equal((await familyCertificate(other)).certificate, null);
      assert.equal((await familyCertificate(other)).progress?.allFive, false);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.certificates WHERE producer_id=ANY($1::uuid[])",
        [[familyId, otherId]],
      );
      await pool.query(
        "DELETE FROM jdatna.ratings WHERE target_id=ANY($1::uuid[])",
        [[familyId, otherId]],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[familyId, otherId]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      await pool.end();
    }
  },
);
