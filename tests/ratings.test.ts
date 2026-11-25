import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { rate, ratingView, ratingSummary } from "../src/server/ratings";

test(
  "isolated ratings: only delivered orders rate, once per deal (a new deal rates again), admin once, member ratings stay private",
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
    });
    const owner = mk("producer", "صاحبة الأسرة"),
      buyer = mk("customer", "عميل تعامل"),
      stranger = mk("customer", "عميل لم يتعامل"),
      admin = mk("admin", "مدير التقييم"),
      otherFamily = mk("producer", "أسرة أخرى");
    const users = [owner, buyer, stranger, admin, otherFamily];
    const familyId = randomUUID(),
      otherFamilyId = randomUUID(),
      productId = randomUUID();
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
        [otherFamilyId, otherFamily],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [id, u.id, "rate-" + id, u.name, city, u.phone],
        );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'طبق التقييم','وصف',20,'صحن','available')",
        [productId, familyId],
      );
      const order = (status: string) =>
        pool.query(
          "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,$6)",
          [randomUUID(), randomUUID(), buyer.id, familyId, productId, status],
        );
      // طلب مرفوض لا يُعدّ تعاملًا.
      await order("declined");
      await assert.rejects(
        rate(buyer, { kind: "family", target: familyId, stars: 5, oath: true }),
        { status: 403 },
      );
      // طلب لم يُسلَّم بعد (مقبول أو قيد التحضير) لا يكفي للتقييم، والأسرة ترى تقييم العميل لتقرر.
      await order("accepted");
      await assert.rejects(
        rate(buyer, { kind: "family", target: familyId, stars: 5, oath: true }),
        { status: 403 },
      );
      await assert.rejects(
        rate(buyer, {
          kind: "product",
          target: productId,
          stars: 5,
          oath: true,
        }),
        { status: 403 },
      );
      await assert.rejects(
        rate(owner, { kind: "member", target: buyer.id, stars: 5, oath: true }),
        { status: 403 },
      );
      assert.equal(
        (await ratingView(owner, { kind: "member", target: buyer.id })).canRate,
        false,
      );
      assert.equal(
        (await ratingView(buyer, { kind: "family", target: familyId })).canRate,
        false,
      );
      await order("completed");
      // لا يُقبل التقييم دون الموافقة على القسم، ويصل نص القسم لمن يحق له التقييم.
      await assert.rejects(
        rate(buyer, { kind: "family", target: familyId, stars: 5 }),
      );
      await assert.rejects(
        rate(buyer, {
          kind: "family",
          target: familyId,
          stars: 5,
          oath: false,
        }),
      );
      assert.match(
        (await ratingView(buyer, { kind: "family", target: familyId })).oath ??
          "",
        /أقسم بالله العلي العظيم/,
      );
      // العضو المتعامل يقيّم الأسرة مرة واحدة لهذا التعامل؛ الثانية «سبق لك تقييم هذه الأسرة».
      await rate(buyer, {
        kind: "family",
        target: familyId,
        stars: 3,
        oath: true,
      });
      await assert.rejects(
        rate(buyer, { kind: "family", target: familyId, stars: 5, oath: true }),
        { status: 409, message: "سبق لك تقييم هذه الأسرة" },
      );
      const once = await ratingView(buyer, {
        kind: "family",
        target: familyId,
      });
      assert.equal(once.canRate, false, "لا زر تقييم بعد تقييم التعامل");
      assert.equal(once.rated, "سبق لك تقييم هذه الأسرة");
      assert.deepEqual(once.mine, { stars: 3, comment: "" });
      // تعامل جديد (طلب مكتمل آخر) يتيح تقييمًا جديدًا، فقد تتغير الجودة.
      await order("completed");
      const again = await ratingView(buyer, {
        kind: "family",
        target: familyId,
      });
      assert.equal(again.canRate, true);
      assert.equal(again.rated, undefined);
      await rate(buyer, {
        kind: "family",
        target: familyId,
        stars: 5,
        comment: "  أكل لذيذ  ",
        oath: true,
      });
      await rate(buyer, {
        kind: "product",
        target: productId,
        stars: 4,
        oath: true,
      });
      // الإدارة تقيّم الأسرة دون طلب؛ صاحبة الأسرة لا تقيّم نفسها؛ الغريب لا يقيّم.
      await rate(admin, {
        kind: "family",
        target: familyId,
        stars: 4,
        oath: true,
      });
      // الإدارة تقيّم مرة واحدة.
      await assert.rejects(
        rate(admin, { kind: "family", target: familyId, stars: 5, oath: true }),
        { status: 409 },
      );
      await assert.rejects(
        rate(owner, { kind: "family", target: familyId, stars: 5, oath: true }),
        { status: 403 },
      );
      await assert.rejects(
        rate(stranger, {
          kind: "product",
          target: productId,
          stars: 1,
          oath: true,
        }),
        { status: 403 },
      );
      await assert.rejects(
        rate(buyer, { kind: "family", target: familyId, stars: 6, oath: true }),
      );
      // العدد بالمقيِّمين (مراجعة أمنية 2026-11-25): المشتري بتعاملين صوت واحد، والإدارة صوت.
      assert.deepEqual(await ratingSummary("family", familyId), {
        average: 4,
        count: 2,
      });
      const mine = await ratingView(buyer, {
        kind: "family",
        target: familyId,
      });
      assert.deepEqual(mine.mine, { stars: 5, comment: "أكل لذيذ" });
      assert.equal(mine.canRate, false);
      assert.equal(mine.rated, "سبق لك تقييم هذه الأسرة");
      assert.equal(
        (await ratingView(null, { kind: "product", target: productId }))
          .canRate,
        false,
      );
      // الأسرة المتعاملة تقيّم العميل؛ تقييم العميل لا يراه غيرها والإدارة.
      await rate(owner, {
        kind: "member",
        target: buyer.id,
        stars: 5,
        oath: true,
      });
      await assert.rejects(
        rate(otherFamily, {
          kind: "member",
          target: buyer.id,
          stars: 1,
          oath: true,
        }),
        { status: 403 },
      );
      await assert.rejects(
        ratingView(stranger, { kind: "member", target: buyer.id }),
        { status: 403 },
      );
      await assert.rejects(
        ratingView(null, { kind: "member", target: buyer.id }),
        { status: 403 },
      );
      assert.equal(
        (await ratingView(admin, { kind: "member", target: buyer.id })).count,
        1,
      );
      assert.equal(
        (await ratingView(owner, { kind: "member", target: buyer.id })).average,
        5,
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.ratings WHERE rater_id=ANY($1::uuid[])",
        [users.map((u) => u.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
        [familyId],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[familyId, otherFamilyId]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      await pool.end();
    }
  },
);
