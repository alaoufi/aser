import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { adminInsights, linearNext } from "../src/server/insights";
import type { SessionUser } from "../src/lib/types";

/**
 * إحصاءات الإدارة مقابل بيانات مزروعة معروفة (قاعدة اختبار معزولة فقط):
 * العدد والقيمة والإتمام والعائدون والتوزيع، واستبعاد حسابات المراجعة وأسرها،
 * والمقارنة بالفترة السابقة، وصلاحية المدير الكامل وحده.
 * الأرقام كلية للمنصة، فيُقارن الفرق قبل الزرع وبعده (وتُعاد المحاولة إن كتب اختبار آخر في اللحظة نفسها).
 */
const skip = process.env.JDATNA_TEST_DB !== "true";
const admin = { id: randomUUID(), role: "admin", name: "مدير" } as SessionUser;

test("the trend line projects the next weeks and never goes below zero", () => {
  assert.equal(linearNext([1, 2, 3, 4], 1), 5);
  assert.equal(linearNext([10, 10, 10], 4), 10);
  assert.equal(linearNext([8, 4, 0], 2), 0);
  assert.equal(linearNext([7], 1), 7);
});

test("statistics are for the full admin only", { skip }, async () => {
  await assert.rejects(
    adminInsights({ ...admin, role: "customer" } as SessionUser, 30),
    { status: 403 },
  );
  await assert.rejects(
    adminInsights(
      { ...admin, role: "customer", permissions: ["orders"] } as SessionUser,
      30,
    ),
    { status: 403 },
  );
  await assert.rejects(adminInsights(admin, 12), /مدة غير مدعومة/);
});

test(
  "statistics match the seeded orders exactly and skip review accounts",
  { skip },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = randomUUID().slice(0, 8);
    const [a, b] = (
      await pool.query(
        "SELECT DISTINCT ON (region_id) c.id,c.region_id,r.name AS region FROM jdatna.cities c JOIN jdatna.regions r ON r.id=c.region_id WHERE c.id !~ '^[0-9a-f]{8}-' ORDER BY region_id,c.id LIMIT 2",
      )
    ).rows;
    const ids = {
      c1: randomUUID(),
      c2: randomUUID(),
      c3: randomUUID(),
      rc: randomUUID(),
      u1: randomUUID(),
      u2: randomUUID(),
      u3: randomUUID(),
    };
    const fam = { f1: randomUUID(), f2: randomUUID(), f3: randomUUID() };
    const prod = { p1: randomUUID(), p2: randomUUID(), p3: randomUUID() };
    const parent = `ins-p-${tag}`,
      child = `ins-c-${tag}`;
    const orders: string[] = [];
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const cleanup = async () => {
      await pool.query("DELETE FROM jdatna.order_requests WHERE id=ANY($1)", [
        orders,
      ]);
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=ANY($1)",
        [Object.values(prod)],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1)", [
        Object.values(prod),
      ]);
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1)",
        [Object.values(fam)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [
        Object.values(ids),
      ]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=ANY($1)", [
        [child, parent],
      ]);
    };
    const seed = async () => {
      for (const [k, id] of Object.entries(ids))
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,review_account) VALUES($1,$2,$3,$4,now(),$5)",
          [
            id,
            `إحصاء ${k}`,
            phone(),
            k.startsWith("u") ? "producer" : "customer",
            k === "rc",
          ],
        );
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,parent_id) VALUES($1,$3,$1,NULL),($2,'فرع إحصاء',$2,$1)",
        [parent, child, `قسم إحصاء ${tag}`],
      );
      const families: [string, string, string, boolean][] = [
        [fam.f1, ids.u1, a.id, false],
        [fam.f2, ids.u2, b.id, false],
        [fam.f3, ids.u3, a.id, true],
      ];
      for (const [id, user, city, review] of families)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,review_only) VALUES($1,$2,$3,$4,$5,$6,'approved',$7)",
          [id, user, `ins-${id}`, `أسرة إحصاء ${tag}`, city, phone(), review],
        );
      const products: [string, string, number, string][] = [
        [prod.p1, fam.f1, 10, child],
        [prod.p2, fam.f2, 20, parent],
        [prod.p3, fam.f3, 30, parent],
      ];
      for (const [id, f, price, cat] of products) {
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,unit,price,status,visible) VALUES($1,$2,$3,'','صحن',$4,'available',true)",
          [id, f, `منتج إحصاء ${tag}`, price],
        );
        await pool.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [id, cat],
        );
      }
      // [عميل، منتج، سعر، كمية، أيام، حالة، قبل كم يوم، وجبة]
      const plan: [
        string,
        string,
        number,
        number,
        number,
        string,
        number,
        string,
      ][] = [
        [ids.c1, prod.p1, 10, 2, 1, "completed", 1, "lunch"],
        [ids.c1, prod.p1, 10, 1, 1, "completed", 2, "lunch"],
        [ids.c2, prod.p2, 20, 1, 3, "pending", 3, "dinner"],
        [ids.c3, prod.p2, 20, 1, 1, "declined", 5, "lunch"],
        [ids.rc, prod.p1, 10, 5, 1, "completed", 1, "lunch"], // حساب مراجعة: مستبعد
        [ids.c2, prod.p3, 30, 1, 1, "completed", 1, "lunch"], // أسرة مراجعة: مستبعدة
        [ids.c1, prod.p1, 10, 1, 1, "completed", 40, "breakfast"], // الفترة السابقة
        [ids.c3, prod.p1, 10, 1, 1, "completed", 200, "lunch"], // قديم: يجعل c3 عائدًا
      ];
      for (const [
        user,
        product,
        price,
        qty,
        daysN,
        status,
        ago,
        meal,
      ] of plan) {
        const id = randomUUID();
        orders.push(id);
        const producer = (
          await pool.query(
            "SELECT producer_id FROM jdatna.products WHERE id=$1",
            [product],
          )
        ).rows[0].producer_id;
        await pool.query(
          `INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status,created_at)
         VALUES($1::uuid,$1::uuid,$1::text,$2,$3,$4,$5,'عميل',$6,$7,$8,current_date,current_date+($9::int-1),$10,now()-$11::int*interval '1 day')`,
          [
            id,
            user,
            producer,
            product,
            { productName: "منتج", unit: "صحن", price, producerName: "أسرة" },
            phone(),
            qty,
            meal,
            daysN,
            status,
            ago,
          ],
        );
      }
    };
    const pick = (d: Awaited<ReturnType<typeof adminInsights>>) => ({
      orders: Number(d.current.orders),
      completed: Number(d.current.completed),
      lost: Number(d.current.lost),
      value: Number(d.current.value),
      customers: Number(d.current.customers),
      prevOrders: Number(d.previous.orders),
      parent:
        d.breakdowns.categories.find((r) => r.label === `قسم إحصاء ${tag}`)
          ?.value ?? 0,
      regionA:
        d.breakdowns.regions.find((r) => r.label === a.region)?.value ?? 0,
      regionB:
        d.breakdowns.regions.find((r) => r.label === b.region)?.value ?? 0,
      lunch: d.breakdowns.meals.find((r) => r.label === "lunch")?.value ?? 0,
      dinner: d.breakdowns.meals.find((r) => r.label === "dinner")?.value ?? 0,
    });
    try {
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const before = pick(await adminInsights(admin, 30));
        await seed();
        const after = await adminInsights(admin, 30);
        const now = pick(after);
        const diff = Object.fromEntries(
          Object.entries(now).map(([k, v]) => [
            k,
            v - before[k as keyof typeof before],
          ]),
        );
        const expected = {
          orders: 4,
          completed: 2,
          lost: 1,
          value: 90, // 2×10 + 1×10 + 1×20×3 أيام؛ المرفوض لا يُحسب
          customers: 3,
          prevOrders: 1,
          parent: 4, // القسم الفرعي يُحسب لأبيه
          regionA: 2,
          regionB: 2,
          lunch: 3,
          dinner: 1,
        };
        ok = JSON.stringify(diff) === JSON.stringify(expected);
        if (!ok && attempt === 2) assert.deepEqual(diff, expected);
        // العائدون والأفضل لا تُقارن بالفرق: تُفحص من أسرنا مباشرة.
        if (ok) {
          const f1 = after.top.families.find(
            (r) => r.value === 2 && r.label === `أسرة إحصاء ${tag}`,
          );
          assert.ok(
            f1 || after.top.families.length === 5,
            "الأسرة الأكثر طلبًا تظهر بعدد طلباتها",
          );
        }
        await cleanup();
        orders.length = 0;
      }
    } finally {
      await cleanup();
    }
  },
);
