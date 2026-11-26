import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * «تنبيهات الأسرة» (2026-11-26) على قاعدة اختبار معزولة: الموافقة الصريحة، منتج جديد يطلق تنبيهًا،
 * جدول توزيع يطلق تنبيهًا عند بدايته فقط، عدم التكرار، تجميع الدفعة، الحد اليومي، الإيقاف والإلغاء،
 * نطاق المنتجات المحددة، ورابط الإلغاء. الإرسال الخارجي ببديل يسجّل الرسائل (لا إشعارات حقيقية).
 */
test(
  "isolated family alerts: consent, new product, schedule start, dedup, batching, daily limit, pause, unsubscribe",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    process.env.FAMILY_ALERTS_TIMER = "off";
    const { db } = await import("../src/server/db");
    const fa = await import("../src/server/family-alerts");
    const { siteTextDefaults } = await import("../src/lib/site-texts");
    const texts = { ...siteTextDefaults };
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const sent: { userId: string; body: string }[] = [];
    fa.setAlertChannels([
      {
        key: "push",
        enabled: () => true,
        send: async (m) => {
          sent.push({ userId: m.userId, body: m.body });
        },
      },
    ]);
    const users: string[] = [];
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mkUser = async (role = "customer") => {
      const id = randomUUID();
      users.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'عضو تنبيه',$2,$3,now())",
        [id, ph(), role],
      );
      return {
        id,
        name: "عضو تنبيه",
        phone: "",
        role,
      } as never as import("../src/lib/types").SessionUser;
    };
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id;
    const familyUser = await mkUser("producer");
    const producerId = randomUUID();
    const slug = `alerts-${producerId.slice(0, 8)}`;
    await pool.query(
      `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة التنبيه',$4,$5,'approved')`,
      [producerId, familyUser.id, slug, city, ph()],
    );
    const product = async (name: string) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,$3,'','صحن','preorder')",
        [id, producerId, name],
      );
      return id;
    };
    const dispatch = (dailyLimit?: number) =>
      fa.dispatchFamilyAlerts({ graceSeconds: 0, texts, dailyLimit });
    const inboxCount = async (u: string) =>
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM jdatna.member_alerts WHERE user_id=$1",
          [u],
        )
      ).rows[0].n as number;
    try {
      const a = await mkUser();
      const b = await mkUser();
      const base = {
        producer: slug,
        notifyNew: true,
        notifySchedule: true,
        scope: "all",
        productIds: [],
      };
      // الموافقة الصريحة شرط، ولا تتابع الأسرة نفسها.
      await assert.rejects(fa.saveFollow(a, base));
      await assert.rejects(fa.saveFollow(a, { ...base, consent: false }));
      await assert.rejects(
        fa.saveFollow(familyUser, { ...base, consent: true }),
        { status: 400 },
      );
      await fa.saveFollow(a, { ...base, consent: true });
      assert.equal(await fa.myFollowerCount(familyUser), 1);

      // منتج جديد ← تنبيه واحد بالنص المعتمد وفيه رابط المنتج ورابط الإلغاء.
      const p1 = await product("مرقوق التنبيه");
      await fa.queueNewProduct(p1);
      let r = await dispatch();
      assert.equal(r.sent, 1);
      assert.match(
        sent.at(-1)!.body,
        new RegExp(
          `تمت إضافة مرقوق التنبيه من أسرة التنبيه\\. للطلب تواصل معهم: .*/products/${p1}`,
        ),
      );
      assert.match(sent.at(-1)!.body, /\/alerts\/unsubscribe\?t=[a-f0-9]{48}/);
      assert.equal(await inboxCount(a.id), 1);
      // لا تكرار: الحدث نفسه مرة أخرى لا يصل.
      await fa.queueNewProduct(p1);
      r = await dispatch();
      assert.equal(r.sent, 0);

      // الدفعة الكبيرة: ثلاثة منتجات ← تنبيه واحد بالعدد.
      for (const n of ["أ", "ب", "ج"])
        await fa.queueNewProduct(await product(n));
      r = await dispatch();
      assert.equal(r.sent, 1);
      assert.match(
        sent.at(-1)!.body,
        /تمت إضافة 3 منتجات جديدة من أسرة التنبيه/,
      );

      // جدول توزيع: المستقبلي لا يُعلن؛ عند حلول موعده يُعلن مرة واحدة.
      const p2 = await product("جريش الجدول");
      const { id: future } = await fa.addSchedule(familyUser, {
        productId: p2,
        kind: "daily",
        startsOn: "2099-01-01",
      });
      r = await dispatch();
      assert.equal(r.sent, 0);
      await pool.query(
        "UPDATE jdatna.product_schedules SET starts_on=current_date-1 WHERE id=$1",
        [future],
      );
      r = await dispatch();
      assert.equal(r.sent, 1);
      assert.match(
        sent.at(-1)!.body,
        /بدأ توزيع جريش الجدول يوميًا من أسرة التنبيه\. اطلبه:/,
      );
      r = await dispatch();
      assert.equal(r.sent, 0, "الجدول يُعلن مرة واحدة");
      // أسبوعي بلا أيام مرفوض.
      await assert.rejects(
        fa.addSchedule(familyUser, {
          productId: p2,
          kind: "weekly",
          weekdays: [],
          startsOn: "2026-12-01",
        }),
      );

      // نطاق «منتجات محددة»: يصل جدول المنتج المختار فقط، ولا تصل المنتجات الجديدة.
      const p3 = await product("قرصان");
      await fa.saveFollow(b, {
        ...base,
        notifyNew: true,
        scope: "selected",
        productIds: [p3],
        consent: true,
      });
      await fa.queueNewProduct(await product("خارج النطاق"));
      await fa.addSchedule(familyUser, {
        productId: p3,
        kind: "weekly",
        weekdays: [0, 3],
        startsOn: "2020-01-01",
      });
      r = await dispatch();
      const forB = r.messages!.filter((m) => m.userId === b.id);
      assert.equal(forB.length, 1);
      assert.match(forB[0].body, /بدأ توزيع قرصان أسبوعيًا/);

      // الإيقاف المؤقت: لا شيء؛ الاستئناف يعيده.
      await fa.changeFollow(a, { producer: slug, action: "pause" });
      await fa.queueNewProduct(await product("وقت الإيقاف"));
      r = await dispatch();
      assert.equal(r.messages!.filter((m) => m.userId === a.id).length, 0);
      await fa.changeFollow(a, { producer: slug, action: "resume" });

      // الحد اليومي: بعد بلوغه يُكتم التنبيه (ويُسجل فلا يتكرر لاحقًا).
      const before = await inboxCount(a.id);
      await fa.queueNewProduct(await product("فوق الحد"));
      r = await dispatch(before);
      assert.equal(r.messages!.filter((m) => m.userId === a.id).length, 0);
      assert.ok(r.suppressed >= 1);
      assert.equal(await inboxCount(a.id), before);

      // «تنبيهاتي» والإلغاء من الرابط بلا دخول.
      const inbox = await fa.myInbox(a);
      assert.ok(inbox.length >= 3);
      const token = (
        await pool.query(
          "SELECT unsubscribe_token AS t FROM jdatna.family_follows WHERE user_id=$1",
          [a.id],
        )
      ).rows[0].t;
      assert.deepEqual(await fa.unsubscribeByToken({ token }), {
        unsubscribed: true,
      });
      assert.deepEqual(await fa.unsubscribeByToken({ token }), {
        unsubscribed: false,
      });
      await assert.rejects(fa.unsubscribeByToken({ token: "x" }));
      assert.deepEqual(await fa.myFollows(a), []);
      await fa.changeFollow(b, { producer: slug, action: "cancel" });
      assert.equal(await fa.myFollowerCount(familyUser), 0);
    } finally {
      fa.setAlertChannels(null);
      await pool
        .query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [producerId])
        .catch(async () => {
          await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
            producerId,
          ]);
          await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
            producerId,
          ]);
        });
      await pool.query(
        "DELETE FROM jdatna.member_alerts WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool
        .query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [users])
        .catch(() => {});
      await pool.end();
    }
  },
);
