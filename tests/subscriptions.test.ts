import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  ownSubscriptions,
  requestSubscription,
  saveSubscriptionPlan,
  subscriptionFamilies,
} from "../src/server/subscriptions";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated subscriptions: the family offers plans, the customer requests within what is offered, the request lands in a chat",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = (role: SessionUser["role"], name: string): SessionUser => ({
      id: randomUUID(),
      name,
      phone: phone(),
      role,
    });
    const owner = mk("producer", "أسرة الاشتراك"),
      customer = mk("customer", "عميل مشترك");
    const fam = randomUUID();
    const slug = "sub-" + fam;
    try {
      for (const u of [owner, customer])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const [city, other] = (
        await pool.query(
          "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities ORDER BY region_id,id LIMIT 2",
        )
      ).rows;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,delivery) VALUES($1,$2,$3,'أسرة الاشتراك',$4,$5,'approved',true)",
        [fam, owner.id, slug, city.id, owner.phone],
      );
      // بلا اشتراكات: لا تظهر، ولا يُقبل طلب.
      assert.equal((await ownSubscriptions(owner)).plan.enabled, false);
      assert.equal(
        (await subscriptionFamilies({ region: city.region_id })).some(
          (f) => f.id === fam,
        ),
        false,
      );
      // التفعيل يلزمه نوع ووجبة.
      await assert.rejects(
        saveSubscriptionPlan(owner, {
          enabled: true,
          daily: false,
          weekly: false,
          monthly: false,
          period: false,
          meals: ["lunch"],
          delivery: true,
          notes: "",
        }),
        { status: 400 },
      );
      await saveSubscriptionPlan(owner, {
        enabled: true,
        daily: true,
        weekly: false,
        monthly: true,
        period: true,
        meals: ["lunch", "dinner"],
        delivery: true,
        notes: "الشهري 26 يومًا",
      });
      // تظهر في منطقتها، ولا تظهر في منطقة أخرى.
      const listed = (
        await subscriptionFamilies({ region: city.region_id })
      ).find((f) => f.id === fam);
      assert.ok(listed);
      assert.deepEqual(listed.plans, ["daily", "monthly", "period"]);
      assert.deepEqual(listed.meals, ["lunch", "dinner"]);
      assert.equal(listed.delivery, true);
      assert.equal(
        (await subscriptionFamilies({ region: other.region_id })).some(
          (f) => f.id === fam,
        ),
        false,
      );
      const tomorrow = new Date(Date.now() + 2 * 86400e3)
        .toISOString()
        .slice(0, 10);
      const base = {
        family: slug,
        plan: "monthly",
        startDate: tomorrow,
        days: null,
        meals: ["lunch"],
        delivery: true,
        location: "حي النخيل، شارع 5",
        notes: "بدون بصل",
      };
      // فقط ما تتيحه الأسرة، وبتاريخ من اليوم فصاعدًا، والمدة المحددة بعدد أيام.
      for (const bad of [
        { plan: "weekly" },
        { meals: ["breakfast"] },
        { plan: "period", days: null },
        { plan: "daily", days: 5 },
        { startDate: "2020-01-01" },
        { delivery: true, location: "" },
      ])
        await assert.rejects(
          requestSubscription(customer, { ...base, ...bad }),
          { status: 400 },
        );
      await assert.rejects(requestSubscription(owner, base), { status: 400 });
      // الطلب يُحفظ ويُرسل ملخصه في محادثة مع الأسرة.
      const r = await requestSubscription(customer, {
        ...base,
        plan: "period",
        days: 10,
        meals: ["lunch", "dinner"],
      });
      const message = (
        await pool.query(
          "SELECT body,sender_id FROM jdatna.messages WHERE conversation_id=$1",
          [r.conversationId],
        )
      ).rows[0];
      assert.equal(message.sender_id, customer.id);
      assert.match(message.body, /طلب اشتراك جديد/);
      assert.match(message.body, /مدة محددة \(10 يوم\)/);
      assert.match(message.body, /غداء، عشاء/);
      assert.match(message.body, /حي النخيل/);
      const incoming = (await ownSubscriptions(owner)).requests;
      assert.equal(incoming.length, 1);
      assert.equal(incoming[0].conversationId, r.conversationId);
      assert.equal(incoming[0].customerName, customer.name);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.subscription_requests WHERE producer_id=$1",
        [fam],
      );
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
        [fam],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=$1",
        [fam],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_subscription_plans WHERE producer_id=$1",
        [fam],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        fam,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [owner.id, customer.id],
      ]);
    }
  },
);
