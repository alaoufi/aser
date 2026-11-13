import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  REVIEW,
  reviewOtpCode,
  reviewStatus,
  setupReview,
} from "../src/server/store-review";
import { passwordLogin } from "../src/server/credentials";
import { searchProducers, todayProducts } from "../src/server/catalog";
import { submitOrder } from "../src/server/orders";
import { startConversation } from "../src/server/chat";

test(
  "isolated store review: owner-only setup, password sign-in without SMS, review family hidden and paired",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "customer" | "producer" | "admin") => ({
      id: randomUUID(),
      name: "اختبار " + role,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
      permissions: [] as string[],
    });
    const admin = mk("admin"),
      real = mk("customer"),
      familyOwner = mk("producer");
    const realFamily = randomUUID(),
      realProduct = randomUUID();
    for (const u of [admin, real, familyOwner])
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.name, u.phone, u.role],
      );
    const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
      .rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
      [
        realFamily,
        familyOwner.id,
        "real-" + realFamily,
        "أسرة حقيقية",
        city,
        familyOwner.phone,
      ],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'مرقوق','وصف',30,'صحن','available')",
      [realProduct, realFamily],
    );

    // بداية نظيفة لحسابات المراجعة في قاعدة الاختبار.
    const phones = [REVIEW.client.phone, REVIEW.family.phone];
    const where =
      "producer_id IN (SELECT p.id FROM jdatna.producer_profiles p JOIN jdatna.users u ON u.id=p.user_id WHERE u.phone=ANY($1))";
    await pool.query(
      `DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE ${where})`,
      [phones],
    );
    for (const t of ["conversations", "order_requests", "products"])
      await pool.query(`DELETE FROM jdatna.${t} WHERE ${where}`, [phones]);
    await pool.query(
      "DELETE FROM jdatna.producer_profiles WHERE user_id IN (SELECT id FROM jdatna.users WHERE phone=ANY($1))",
      [phones],
    );
    await pool.query(
      "DELETE FROM jdatna.sessions WHERE user_id IN (SELECT id FROM jdatna.users WHERE phone=ANY($1))",
      [phones],
    );
    await pool.query("DELETE FROM jdatna.users WHERE phone=ANY($1)", [phones]);

    // المالك فقط، وكلمة المرور مطلوبة أول مرة.
    await assert.rejects(setupReview(real, { days: 1 }), /لمدير المنصة/);
    await assert.rejects(setupReview(admin, { days: 1 }), /كلمة مرور/);
    const password = "review-" + randomUUID().slice(0, 8);
    const status = await setupReview(admin, { password, days: 1 });
    assert.equal(status.client && status.family, true);
    assert.ok(status.until);
    // التجهيز مرة ثانية لا يكرر البيانات ولا يغيّر كلمة المرور.
    await setupReview(admin, { days: 1 });

    // الدخول باسم المستخدم وكلمة المرور، بلا رمز SMS.
    const signed = await passwordLogin({
      identifier: REVIEW.client.username,
      password,
    });
    assert.ok("token" in signed && signed.token);
    // حساب المراجع من قاعدة البيانات (لا من نتيجة الدخول التي تحمل كلمة المرور).
    const reviewer = {
      ...(
        await pool.query(
          "SELECT id,name,phone,role FROM jdatna.users WHERE username=$1",
          [REVIEW.client.username],
        )
      ).rows[0],
      permissions: [] as string[],
    } as typeof real;
    const familyLogin = await passwordLogin({
      identifier: REVIEW.family.username,
      password,
    });
    assert.ok("token" in familyLogin);

    // بيانات جاهزة: طبق وطلب ومحادثة.
    const family = (
      await pool.query(
        "SELECT id,review_only FROM jdatna.producer_profiles WHERE slug=$1",
        [REVIEW.familySlug],
      )
    ).rows[0];
    assert.equal(family.review_only, true);
    const counts = (
      await pool.query(
        `SELECT (SELECT count(*) FROM jdatna.products WHERE producer_id=$1)::int AS products,
          (SELECT count(*) FROM jdatna.order_requests WHERE producer_id=$1)::int AS orders,
          (SELECT count(*) FROM jdatna.messages m JOIN jdatna.conversations c ON c.id=m.conversation_id WHERE c.producer_id=$1)::int AS messages`,
        [family.id],
      )
    ).rows[0];
    assert.deepEqual(counts, { products: 1, orders: 1, messages: 2 });

    // الأسرة التجريبية لا تظهر في البحث ومائدة اليوم.
    const families = await searchProducers({});
    assert.ok(!families.some((p) => p.slug === REVIEW.familySlug));
    const today = await todayProducts({});
    assert.ok(!today.some((p) => p.producerSlug === REVIEW.familySlug));

    // حساب المراجعة لا يطلب من أسرة حقيقية، والعميل الحقيقي لا يراسل أسرة المراجعة.
    const order = {
      requestKey: randomUUID(),
      productId: realProduct,
      name: "مراجع",
      quantity: 1,
      meal: "lunch",
      startDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
      notes: "",
    };
    await assert.rejects(submitOrder(reviewer, order), /أسرة المراجعة فقط/);
    await assert.rejects(
      startConversation(real, { producer: REVIEW.familySlug }),
      /غير متاحة/,
    );

    // رمز التحقق: لرقم إنشاء الحساب التجريبي أثناء الوضع فقط، وحسابا المراجعة بكلمة المرور.
    assert.equal(await reviewOtpCode(REVIEW.signupPhone), REVIEW.code);
    await assert.rejects(reviewOtpCode(REVIEW.client.phone), /بكلمة المرور/);
    assert.equal(await reviewOtpCode(real.phone), null);
    await setupReview(admin, { days: 0 });
    assert.equal((await reviewStatus(admin)).until, null);
    await assert.rejects(reviewOtpCode(REVIEW.signupPhone), /مغلق/);
  },
);
