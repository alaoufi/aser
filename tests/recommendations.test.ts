import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  familyInsights,
  memberSuggestions,
} from "../src/server/recommendations";

/**
 * مقترح لك وطلب منطقتك على قاعدة معزولة:
 * - العميل الذي طلب الجريش يُقترح عليه جريش أسرة أخرى أولًا، بسبب «لأنك تحب …».
 * - ما طلبه آخر 3 أيام لا يُقترح، ولا منتجات أسرته هو، ولا ما خارج منطقته.
 * - الأسرة ترى الأكثر طلبًا في منطقتها وفرصة لقسم لا تقدّمه، ولا يظهر رقم أقل من 3.
 */
test(
  "isolated suggestions follow the member's taste and family insights stay aggregated",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const tag = randomUUID().slice(0, 8);
    const city = (
      await pool.query(
        "SELECT c.id, c.region_id FROM jdatna.cities c WHERE c.id !~ '^[0-9a-f]{8}-' ORDER BY c.id LIMIT 1",
      )
    ).rows[0];
    const far = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE region_id <> $1 AND id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
        [city.region_id],
      )
    ).rows[0];
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const users: string[] = [];
    const user = async (role: string) => {
      const id = randomUUID();
      users.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [id, "عضو " + tag, phone(), role],
      );
      return { id, name: "عضو", phone: "", role } as never;
    };
    const families: string[] = [];
    const family = async (cityId: string) => {
      const owner = (await user("producer")) as unknown as { id: string };
      const id = randomUUID();
      families.push(id);
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
        [id, owner.id, "rec-" + id.slice(0, 8), "أسرة " + tag, cityId, phone()],
      );
      return { id, owner: owner as never };
    };
    const cats = [`rec-a-${tag}`, `rec-b-${tag}`, `rec-c-${tag}`];
    for (const c of cats)
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,$1,$1,'✦')",
        [c],
      );
    const products: string[] = [];
    const product = async (
      producer: string,
      category: string,
    ): Promise<string> => {
      const id = randomUUID();
      products.push(id);
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق','وصف','meal','available',true)",
        [id, producer],
      );
      await pool.query(
        "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
        [id, category],
      );
      return id;
    };
    const order = (who: string, producer: string, item: string, daysAgo = 10) =>
      pool.query(
        `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,created_at)
         VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,now() - make_interval(days => $6))`,
        [randomUUID(), randomUUID(), who, producer, item, daysAgo],
      );
    try {
      const f1 = await family(city.id);
      const f2 = await family(city.id);
      const f3 = await family(far.id);
      const a1 = await product(f1.id, cats[0]); // ما طلبه العميل
      const a2 = await product(f2.id, cats[0]); // نفس القسم من أسرة أخرى
      const b2 = await product(f2.id, cats[1]); // قسم آخر
      const aFar = await product(f3.id, cats[0]); // خارج المنطقة
      const customer = (await user("customer")) as unknown as { id: string };
      await order(customer.id, f1.id, a1, 1); // آخر 3 أيام: لا يُقترح من جديد

      const mine = await memberSuggestions(
        customer as never,
        city.region_id,
        50,
      );
      const ids = mine.items.map((s) => s.product.id);
      assert.equal(mine.personal, true);
      assert.ok(ids.includes(a2), "same category from another family");
      assert.ok(!ids.includes(a1), "just ordered: not suggested again");
      assert.ok(!ids.includes(aFar), "outside the member's region");
      assert.ok(
        ids.indexOf(a2) < ids.indexOf(b2),
        "the category the member likes ranks first",
      );
      assert.equal(
        mine.items.find((s) => s.product.id === a2)?.reason,
        `لأنك تحب ${cats[0]}`,
      );

      // الأسرة لا يُقترح عليها منتجها.
      const own = await memberSuggestions(f2.owner, city.region_id, 50);
      assert.ok(
        !own.items.some((s) => ([a2, b2] as string[]).includes(s.product.id)),
      );

      // طلب منطقتك: قسم a عليه طلبان فقط (أقل من 3) فلا يظهر رقمه.
      let insights = await familyInsights(f2.owner);
      assert.ok(insights);
      assert.ok(!insights.popular.some((p) => p.category === cats[0]));
      // بعد 3 طلبات أخرى على قسم c (لا تقدّمه الأسرة 2) يظهر فرصةً وأكثر طلبًا.
      const c1 = await product(f1.id, cats[2]);
      for (let i = 0; i < 3; i++) {
        const other = (await user("customer")) as unknown as { id: string };
        await order(other.id, f1.id, c1);
      }
      insights = await familyInsights(f2.owner);
      assert.ok(
        insights?.popular.some((p) => p.category === cats[2] && p.orders >= 3),
      );
      assert.ok(insights?.opportunities.some((o) => o.category === cats[2]));
      assert.ok(
        !insights?.opportunities.some((o) => o.category === cats[1]),
        "a category the family already offers is not an opportunity",
      );
      // زائر بلا حساب: اقتراحات عامة (الأكثر طلبًا) بلا تخصيص.
      const guest = await memberSuggestions(null, city.region_id, 50);
      assert.equal(guest.personal, false);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE product_id = ANY($1::uuid[])",
        [products],
      );
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id = ANY($1::uuid[])",
        [products],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE id = ANY($1::uuid[])",
        [products],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id = ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.categories WHERE id = ANY($1)", [
        cats,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id = ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
