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
          "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY region_id,id LIMIT 2",
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

test(
  "isolated subscription menu: family dishes per meal, agreement, the customer's default dish and a day changed a day ahead",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const {
      addMenuItem,
      removeMenuItem,
      decideSubscription,
      customerAgree,
      viewContract,
      mySubscriptions,
      setDefaultDish,
      setDayDish,
      familyDaySchedule,
    } = await import("../src/server/subscriptions");
    const pool = db();
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const owner: SessionUser = {
      id: randomUUID(),
      name: "أسرة القائمة",
      phone: phone(),
      role: "producer",
    };
    const customer: SessionUser = {
      id: randomUUID(),
      name: "مشترك القائمة",
      phone: phone(),
      role: "customer",
    };
    const fam = randomUUID();
    const iso = (offset: number) => {
      const d = new Date(
        `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date())}T12:00:00Z`,
      );
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    try {
      for (const u of [owner, customer])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,delivery) VALUES($1,$2,$3,'أسرة القائمة',$4,$5,'approved',true)",
        [fam, owner.id, "menu-" + fam, city, owner.phone],
      );
      await saveSubscriptionPlan(owner, {
        enabled: true,
        daily: true,
        weekly: true,
        monthly: false,
        period: false,
        meals: ["breakfast", "lunch"],
        delivery: true,
        notes: "",
      });
      // قائمة الأطباق لكل وجبة.
      await addMenuItem(owner, {
        meal: "breakfast",
        name: "فول، عدس، بيض مسلوق مع الخبز",
      });
      await addMenuItem(owner, { meal: "lunch", name: "كبسة رز مع لحم" });
      const menu = await addMenuItem(owner, { meal: "lunch", name: "مرقوق" });
      const kabsa = menu.find((m) => m.name === "كبسة رز مع لحم")!;
      const marqooq = menu.find((m) => m.name === "مرقوق")!;
      const breakfast = menu.find((m) => m.meal === "breakfast")!;
      await assert.rejects(
        addMenuItem(customer, { meal: "lunch", name: "x y" }),
        {
          status: 404,
        },
      );
      // الطلب، ثم لا اختيار قبل الاتفاق.
      const sub = await requestSubscription(customer, {
        family: "menu-" + fam,
        plan: "weekly",
        startDate: iso(0),
        days: null,
        meals: ["breakfast", "lunch"],
        delivery: false,
        location: "",
        notes: "",
      });
      await assert.rejects(
        setDefaultDish(customer, {
          id: sub.id,
          meal: "lunch",
          itemId: kabsa.id,
        }),
        { status: 409 },
      );
      // موافقة الأسرة تنتظر ضغط العميل «تم الاتفاق مع الأسرة».
      await assert.rejects(
        decideSubscription(owner, { id: sub.id, status: "agreed" }),
        { status: 409 },
      );
      await assert.rejects(customerAgree(owner, { id: sub.id }), {
        status: 404,
      });
      await customerAgree(customer, { id: sub.id });
      await decideSubscription(owner, { id: sub.id, status: "agreed" });
      await assert.rejects(
        decideSubscription(owner, { id: sub.id, status: "agreed" }),
        { status: 409 },
      );
      // العقد: يراه الطرفان، وفيه الشروط ونسخة المحادثة، وثابت في القاعدة.
      const contractId = (await mySubscriptions(customer)).subscriptions[0]
        .contractId as string;
      assert.ok(contractId);
      const contract = await viewContract(customer, contractId);
      assert.equal((await viewContract(owner, contractId)).id, contractId);
      const stranger: SessionUser = {
        id: randomUUID(),
        name: "غريب",
        phone: phone(),
        role: "customer",
      };
      await assert.rejects(viewContract(stranger, contractId), { status: 404 });
      assert.equal(contract.familyName, "أسرة القائمة");
      assert.equal(contract.customerName, customer.name);
      assert.equal(contract.terms.planLabel, "أسبوعي");
      assert.match(contract.transcript[0].body, /طلب اشتراك جديد/);
      assert.ok(
        contract.transcript.some((m) => /تم الاتفاق مع الأسرة/.test(m.body)),
      );
      assert.match(contract.contentHash, /^[a-f0-9]{64}$/);
      await assert.rejects(
        pool.query(
          "UPDATE jdatna.subscription_contracts SET customer_name='مزور' WHERE id=$1",
          [contractId],
        ),
        /ثابت/,
      );
      await assert.rejects(
        pool.query("DELETE FROM jdatna.subscription_contracts WHERE id=$1", [
          contractId,
        ]),
        /ثابت/,
      );
      await assert.rejects(
        pool.query("TRUNCATE jdatna.subscription_contracts"),
        /ثابت/,
      );
      const agreedMsg = (
        await pool.query(
          "SELECT body FROM jdatna.messages WHERE conversation_id=$1 AND sender_id=$2",
          [sub.conversationId, owner.id],
        )
      ).rows[0];
      assert.match(agreedMsg.body, /وافقت الأسرة على الاتفاق/);
      // الطبق الدائم: من قائمة الأسرة لهذه الوجبة فقط.
      await assert.rejects(
        setDefaultDish(customer, {
          id: sub.id,
          meal: "lunch",
          itemId: breakfast.id,
        }),
        { status: 400 },
      );
      await assert.rejects(
        setDefaultDish(customer, {
          id: sub.id,
          meal: "dinner",
          itemId: kabsa.id,
        }),
        { status: 400 },
      );
      await setDefaultDish(customer, {
        id: sub.id,
        meal: "lunch",
        itemId: kabsa.id,
      });
      await setDefaultDish(customer, {
        id: sub.id,
        meal: "breakfast",
        itemId: breakfast.id,
      });
      // اليوم مقفل، والغد يُعدَّل، وخارج المدة مرفوض.
      await assert.rejects(
        setDayDish(customer, {
          id: sub.id,
          day: iso(0),
          meal: "lunch",
          itemId: marqooq.id,
        }),
        { status: 409 },
      );
      await assert.rejects(
        setDayDish(customer, {
          id: sub.id,
          day: iso(10),
          meal: "lunch",
          itemId: marqooq.id,
        }),
        { status: 400 },
      );
      await setDayDish(customer, {
        id: sub.id,
        day: iso(1),
        meal: "lunch",
        itemId: marqooq.id,
      });
      const mine = (await mySubscriptions(customer)).subscriptions[0];
      assert.equal(mine.status, "agreed");
      assert.equal(mine.defaults.lunch, kabsa.id);
      assert.deepEqual(mine.upcoming[0], iso(1));
      assert.equal(mine.upcoming.at(-1), iso(6), "الأسبوعي سبعة أيام");
      assert.deepEqual(
        mine.overrides.map((o: { day: string; itemId: string }) => [
          o.day,
          o.itemId,
        ]),
        [[iso(1), marqooq.id]],
      );
      // جدول الغد عند الأسرة: مرقوق للغداء (تغيير الغد)، والفطور الدائم.
      const tomorrow = await familyDaySchedule(owner, iso(1));
      const dishes = Object.fromEntries(
        tomorrow.rows.map((r) => [r.meal, r.dish]),
      );
      assert.deepEqual(dishes, {
        breakfast: "فول، عدس، بيض مسلوق مع الخبز",
        lunch: "مرقوق",
      });
      // بعد الغد يعود الطبق الدائم.
      const after = await familyDaySchedule(owner, iso(2));
      assert.equal(
        after.rows.find((r) => r.meal === "lunch")?.dish,
        "كبسة رز مع لحم",
      );
      // إلغاء التغيير يعيد الغد للدائم، وحذف الطبق يُخفيه من القائمة فقط.
      await setDayDish(customer, {
        id: sub.id,
        day: iso(1),
        meal: "lunch",
        itemId: null,
      });
      assert.equal(
        (await familyDaySchedule(owner, iso(1))).rows.find(
          (r) => r.meal === "lunch",
        )?.dish,
        "كبسة رز مع لحم",
      );
      const left = await removeMenuItem(owner, { id: kabsa.id });
      assert.equal(
        left.some((m) => m.id === kabsa.id),
        false,
      );
      assert.equal(
        (await mySubscriptions(customer)).subscriptions[0].itemNames[kabsa.id],
        "كبسة رز مع لحم",
      );
    } finally {
      // تنظيف الاختبار المعزول: حذف العقد مسموح في قاعدة الاختبار فقط وبضبط صريح.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL jdatna.contract_cleanup='on'");
        await client.query(
          "DELETE FROM jdatna.subscription_contracts WHERE producer_id=$1",
          [fam],
        );
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      await pool.query(
        "DELETE FROM jdatna.subscription_requests WHERE producer_id=$1",
        [fam],
      );
      await pool.query(
        "DELETE FROM jdatna.subscription_menu_items WHERE producer_id=$1",
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
