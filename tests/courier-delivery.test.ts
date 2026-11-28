import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  assignOrderCourier,
  courierDeliveries,
  customerChooseCourier,
  listCouriers,
  markCourierDelivered,
  ownCourier,
  setCourierPickup,
  saveCourier,
  setCourierActive,
} from "../src/server/couriers";
import { memberOrders, producerOrders } from "../src/server/orders";
import { rate, ratingView } from "../src/server/ratings";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated courier pricing, active toggle, coverage visibility, and delivery handoff",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const prior = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!/^[a-f0-9]{64}$/i.test(prior ?? ""))
      process.env.DOCUMENT_ENCRYPTION_KEY = "c".repeat(64);
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = (role: SessionUser["role"], name: string): SessionUser => ({
      id: randomUUID(),
      name,
      phone: phone(),
      role,
    });
    const k1 = mk("customer", "مندوب المدينة والمركز"),
      k2 = mk("customer", "مندوب المدينة فقط"),
      fCity = mk("producer", "أسرة في المدينة"),
      fCenter = mk("producer", "أسرة في المركز"),
      fFar = mk("producer", "أسرة بعيدة"),
      customer = mk("customer", "عميل التوصيل");
    const users = [k1, k2, fCity, fCenter, fFar, customer];
    const fam = {
      city: randomUUID(),
      center: randomUUID(),
      far: randomUUID(),
    };
    const docs = [randomUUID(), randomUUID()];
    const productId = randomUUID(),
      orderId = randomUUID(),
      pickupOrder = randomUUID(),
      ownOrder = randomUUID();
    const tag = randomUUID().slice(0, 8);
    const centerNode = "test-center:" + tag;
    let regionNode = "";
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      // مدينتان من منطقتين مختلفتين، ومركز تابع للأولى.
      const [a, b] = (
        await pool.query(
          "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY region_id,id LIMIT 2",
        )
      ).rows as { id: string; region_id: string }[];
      regionNode = "region:" + a.region_id;
      await pool.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id) VALUES($1,'center',$2,$3,$4)",
        [centerNode, "مركز اختبار " + tag, "city:" + a.id, a.region_id],
      );
      for (const [id, user, cityId] of [
        [fam.city, fCity, a.id],
        [fam.center, fCenter, b.id],
        [fam.far, fFar, b.id],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,trade_name,city_id,phone,status,pickup_location) VALUES($1,$2,$3,$4,$4,$5,$6,'approved','حي النخيل، شارع الأسرة')",
          [id, user.id, "kd-" + id, user.name, cityId, user.phone],
        );
      // أسرة في مدينة أخرى لكن تغطيتها تشمل المركز التابع لمدينة المندوب.
      await pool.query(
        "INSERT INTO jdatna.producer_coverage(producer_id,node_id) VALUES($1,$2)",
        [fam.center, centerNode],
      );
      for (const [i, u] of [k1, k2].entries())
        await pool.query(
          "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'national_id',$3,'image/jpeg',10)",
          [docs[i], u.id, "test/" + docs[i]],
        );
      const base = (u: SessionUser, i: number) => ({
        name: u.name,
        nationalId: i ? "1023456781" : "1023456782",
        documentId: docs[i],
        carType: "سيارة",
        cityId: a.id,
      });
      // المراكز لا بد أن تتبع مدينة المندوب.
      await assert.rejects(
        saveCourier(k1, {
          ...base(k1, 0),
          cityId: b.id,
          centers: [{ nodeId: centerNode, price: 10 }],
        }),
        { status: 400 },
      );
      await saveCourier(k1, {
        ...base(k1, 0),
        cityPrice: 15,
        centers: [{ nodeId: centerNode, price: 25 }],
      });
      await saveCourier(k2, base(k2, 1));
      await pool.query(
        "UPDATE jdatna.courier_profiles SET status='approved',approved_at=now() WHERE user_id=ANY($1::uuid[])",
        [[k1.id, k2.id]],
      );
      const k1User = { ...k1, role: "courier" as const };
      const own = await ownCourier(k1User);
      assert.equal(own?.cityPrice, 15);
      assert.deepEqual(own?.centers, [{ nodeId: centerNode, price: 25 }]);
      assert.equal(own?.active, true);

      const names = async (u: SessionUser) =>
        (await listCouriers(u, {}))
          .filter((k) => [k1.id, k2.id].includes(k.userId))
          .map((k) => k.name)
          .sort();
      // أسرة المدينة ترى مندوبي المدينة، مع التسعير (المدينة سعر واحد أو بالاتفاق).
      assert.deepEqual(await names(fCity), [k1.name, k2.name].sort());
      const card = (await listCouriers(fCity, {})).find(
        (k) => k.userId === k1.id,
      );
      assert.equal(card?.cityPrice, 15);
      assert.deepEqual(card?.centers, [
        { name: "مركز اختبار " + tag, price: 25 },
      ]);
      assert.equal(
        (await listCouriers(fCity, {})).find((k) => k.userId === k2.id)
          ?.cityPrice,
        null,
      );
      // أسرة المركز ترى من يخدم المركز فقط، والأسرة خارج التغطية لا ترى أحدًا.
      assert.deepEqual(await names(fCenter), [k1.name]);
      assert.deepEqual(await names(fFar), []);
      // تغطية المنطقة كلها تشمل مندوبي مدنها.
      await pool.query(
        "INSERT INTO jdatna.producer_coverage(producer_id,node_id) VALUES($1,$2)",
        [fam.far, regionNode],
      );
      assert.deepEqual(await names(fFar), [k1.name, k2.name].sort());
      // غير النشط يختفي اسمه.
      await setCourierActive(k1User, { active: false });
      assert.deepEqual(await names(fCity), [k2.name]);
      await setCourierActive(k1User, { active: true });
      await assert.rejects(setCourierActive(customer, { active: true }), {
        status: 404,
      });

      // الطلب: العميل أرسل موقعه، والأسرة تسنده لمندوب فيصله الموقعان.
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق التوصيل','وصف','meal','available',false)",
        [productId, fam.city],
      );
      for (const [id, status] of [
        [orderId, "pending"],
        [pickupOrder, "accepted"],
      ])
        await pool.query(
          `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status)
           VALUES($1,$2,'h',$3,$4,$5,'{"productName":"طبق التوصيل"}','عميل التوصيل',$6,2,'lunch',current_date+1,current_date+1,$7)`,
          [
            id,
            randomUUID(),
            customer.id,
            fam.city,
            productId,
            customer.phone,
            status,
          ],
        );
      await pool.query(
        "INSERT INTO jdatna.order_fulfillment(order_id,method,location) VALUES($1,'delivery','https://maps.google.com/?q=24.7,46.6'),($2,'pickup',NULL)",
        [orderId, pickupOrder],
      );
      const assign = {
        orderId,
        courierUserId: k1.id,
        pickupLocation: "حي النخيل، شارع الأسرة",
      };
      // قبل القبول لا يُسند، والاستلام المباشر لا يُسند، والأسرة الأخرى لا تسند طلبًا ليس لها.
      await assert.rejects(assignOrderCourier(fCity, assign), { status: 409 });
      await pool.query(
        "UPDATE jdatna.order_requests SET status='accepted' WHERE id=$1",
        [orderId],
      );
      await assert.rejects(
        assignOrderCourier(fCity, { ...assign, orderId: pickupOrder }),
        { status: 409 },
      );
      await assert.rejects(assignOrderCourier(fFar, assign), { status: 404 });
      // مندوب غير نشط لا يُسند إليه.
      await setCourierActive(k1User, { active: false });
      await assert.rejects(assignOrderCourier(fCity, assign), { status: 400 });
      await setCourierActive(k1User, { active: true });
      assert.equal(
        (await assignOrderCourier(fCity, assign)).courierName,
        k1.name,
      );
      const familyView = (await producerOrders(fCity)).find(
        (o) => o.id === orderId,
      );
      assert.equal(familyView?.courierName, k1.name);
      assert.equal(familyView?.courierStatus, "assigned");

      const [delivery] = await courierDeliveries(k1User);
      assert.equal(delivery.orderId, orderId);
      assert.equal(delivery.pickupLocation, "حي النخيل، شارع الأسرة");
      assert.equal(
        delivery.deliveryLocation,
        "https://maps.google.com/?q=24.7,46.6",
      );
      assert.equal(delivery.customerPhone, customer.phone);
      assert.equal(delivery.family, fCity.name);
      assert.equal(delivery.product, "طبق التوصيل");
      // مندوب آخر لا يرى الطلب ولا يؤكده.
      assert.deepEqual(await courierDeliveries(k2), []);
      await assert.rejects(markCourierDelivered(k2, { orderId }), {
        status: 404,
      });
      // قبل التوصيل لا تقييم للمندوب.
      const stars = { kind: "courier", target: k1.id, stars: 5, oath: true };
      await assert.rejects(rate(fCity, stars), { status: 403 });
      await markCourierDelivered(k1User, { orderId });
      // بعد التوصيل تقيّمه الأسرة التي أوصل طلبها، لا غيرها ولا هو نفسه.
      assert.equal((await ratingView(fCity, stars)).canRate, true);
      await rate(fCity, stars);
      await assert.rejects(rate(fFar, stars), { status: 403 });
      await assert.rejects(rate(k1User, stars), { status: 403 });
      const rated = (await listCouriers(fCity, {})).find(
        (k) => k.userId === k1.id,
      );
      assert.equal(rated?.ratingAverage, 5);
      assert.equal(rated?.ratingCount, 1);
      assert.equal((await courierDeliveries(k1User))[0].status, "delivered");
      // بعد التوصيل لا يُعاد الإسناد.
      await assert.rejects(
        assignOrderCourier(fCity, { ...assign, courierUserId: k2.id }),
        { status: 409 },
      );

      // «تجمع المندوبين» للعميل: العامون فقط، وحساب المندوب لا يتصفحه.
      assert.ok(
        (await listCouriers(customer, {})).some((k) => k.userId === k2.id),
      );
      assert.ok(
        (await listCouriers(customer, {})).every((k) => k.familyName === null),
      );
      await assert.rejects(listCouriers(k1User, {}), { status: 403 });
      // العميل يختار مندوبًا لطلبه هو (توصيل مقبول)، لا لطلب غيره ولا بعد التوصيل.
      await pool.query(
        `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status)
         VALUES($1,$2,'h',$3,$4,$5,'{"productName":"طبق التوصيل"}','عميل التوصيل',$6,1,'lunch',current_date+1,current_date+1,'pending')`,
        [
          ownOrder,
          randomUUID(),
          customer.id,
          fam.city,
          productId,
          customer.phone,
        ],
      );
      await pool.query(
        "INSERT INTO jdatna.order_fulfillment(order_id,method,location) VALUES($1,'delivery','حي الملقا')",
        [ownOrder],
      );
      const pick = { orderId: ownOrder, courierUserId: k2.id };
      await assert.rejects(customerChooseCourier(customer, pick), {
        status: 409,
      });
      await pool.query(
        "UPDATE jdatna.order_requests SET status='preparing' WHERE id=$1",
        [ownOrder],
      );
      await assert.rejects(customerChooseCourier(fCity, pick), {
        status: 404,
      });
      await assert.rejects(
        customerChooseCourier(customer, { ...pick, orderId }),
        { status: 409 },
      );
      assert.equal(
        (await customerChooseCourier(customer, pick)).courierName,
        k2.name,
      );
      // يغيّر اختياره قبل التوصيل، والأسرة لا تغيّر مندوبًا اختاره العميل.
      assert.equal(
        (
          await customerChooseCourier(customer, {
            ...pick,
            courierUserId: k1.id,
          })
        ).courierName,
        k1.name,
      );
      await assert.rejects(
        assignOrderCourier(fCity, {
          ...assign,
          orderId: ownOrder,
          courierUserId: k2.id,
        }),
        { status: 409 },
      );
      const mine = (await memberOrders(customer)).find(
        (o) => o.id === ownOrder,
      );
      assert.equal(mine?.courierName, k1.name);
      assert.equal(mine?.courierByMe, true);
      assert.equal(mine?.courierPhone, k1.phone);
      const famSees = (await producerOrders(fCity)).find(
        (o) => o.id === ownOrder,
      );
      assert.equal(famSees?.courierByCustomer, true);
      const forCourier = (await courierDeliveries(k1User)).find(
        (d) => d.orderId === ownOrder,
      );
      assert.equal(forCourier?.byCustomer, true);
      // موقع الاستلام: موقع الأسرة المحفوظ في ملفها.
      assert.equal(forCourier?.pickupLocation, "حي النخيل، شارع الأسرة");
      // الأسرة ترسل موقع الاستلام لمندوب العميل؛ أسرة أخرى لا تستطيع.
      const spot = {
        orderId: ownOrder,
        pickupLocation: "https://maps.google.com/?q=24.8,46.7",
      };
      await assert.rejects(setCourierPickup(fFar, spot), { status: 404 });
      await setCourierPickup(fCity, spot);
      assert.equal(
        (await courierDeliveries(k1User)).find((d) => d.orderId === ownOrder)
          ?.pickupLocation,
        spot.pickupLocation,
      );
      // طلب أسندته الأسرة لا يغيّره العميل.
      await assert.rejects(
        customerChooseCourier(customer, { ...pick, orderId }),
        { status: 409 },
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE id=ANY($1::uuid[])",
        [[orderId, pickupOrder, ownOrder]],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query(
        "DELETE FROM jdatna.ratings WHERE kind='courier' AND target_id=$1",
        [k1.id],
      );
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE user_id=ANY($1::uuid[])",
        [[k1.id, k2.id]],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_coverage WHERE producer_id=ANY($1::uuid[])",
        [Object.values(fam)],
      );
      await pool.query("DELETE FROM jdatna.coverage_nodes WHERE id=$1", [
        centerNode,
      ]);
      await pool.query(
        "DELETE FROM jdatna.producer_documents WHERE id=ANY($1::uuid[])",
        [docs],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [Object.values(fam)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      if (prior === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
      else process.env.DOCUMENT_ENCRYPTION_KEY = prior;
    }
  },
);
