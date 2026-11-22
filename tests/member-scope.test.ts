import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";
import { parseMine } from "../src/server/member-scope";

/**
 * فلاتر العضو أعلى الصفحة (قرار المالك 2026-11-22): الافتراضي الكل، وكل مفتاح يعمل وحده،
 * والمفتاحان معًا يجتمعان. الأسرة: مشابه لمنتجاتي (بلا منتجاتها) ومنطقتي. العميل: مشابه لطلباتي
 * ومنطقتي. المندوب: حسب تغطيتي.
 */
test("only known keys are read from the link", () => {
  assert.deepEqual(parseMine("area,similar,evil"), ["similar", "area"]);
  assert.deepEqual(parseMine(["coverage"]), ["coverage"]);
  assert.deepEqual(parseMine(undefined), []);
});

test(
  "each member sees what matches their own products, orders, region or coverage",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { memberScope } = await import("../src/server/member-scope");
    const { searchProducts } = await import("../src/server/catalog");
    const { listOffers } = await import("../src/server/offers");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const [r1, r2] = (
      await pool.query<{ id: string; region: string }>(
        "SELECT DISTINCT ON (region_id) id,region_id AS region FROM jdatna.cities ORDER BY region_id,id LIMIT 2",
      )
    ).rows;
    const [c1, c2] = (
      await pool.query<{ id: string }>(
        "SELECT id FROM jdatna.categories ORDER BY id LIMIT 2",
      )
    ).rows.map((r) => r.id);
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const users: string[] = [];
    const families: Record<
      string,
      { user: string; id: string; product: string }
    > = {};
    const mkUser = async (role: string) => {
      const id = randomUUID();
      users.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'عضو الفلاتر',$2,$3,now())",
        [id, phone(), role],
      );
      return id;
    };
    // A وB وD في منطقة واحدة، وC في منطقة أخرى. A وB وC قسمها c1، وD قسمها c2.
    const plan = [
      ["A", r1.id, c1],
      ["B", r1.id, c1],
      ["C", r2.id, c1],
      ["D", r1.id, c2],
    ] as const;
    try {
      for (const [name, city, category] of plan) {
        const user = await mkUser("producer");
        const id = randomUUID();
        const product = randomUUID();
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [id, user, "mine-" + id, "أسرة " + name, city, phone()],
        );
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,$3,'وصف',20,'صحن','available')",
          [product, id, "طبق فلتر " + name],
        );
        await pool.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [product, category],
        );
        families[name] = { user, id, product };
      }
      const ours = new Map(
        Object.entries(families).map(([n, f]) => [f.product, n]),
      );
      const seen = async (mine: Awaited<ReturnType<typeof memberScope>>) =>
        (await searchProducts({ mine: mine.filters, include: "all" }))
          .map((p) => ours.get(p.id))
          .filter(Boolean)
          .sort()
          .join("");
      const as = (id: string, role: SessionUser["role"]) =>
        ({ id, name: "عضو", phone: "", role }) as SessionUser;

      const famA = as(families.A.user, "producer");
      const none = await memberScope(famA, []);
      assert.equal(none.kind, "family");
      assert.equal(none.filters, null, "الافتراضي: الكل بلا فلتر");
      assert.equal(await seen(none), "ABCD");
      assert.equal(
        await seen(await memberScope(famA, ["similar"])),
        "BC",
        "مشابه لمنتجاتي: نفس القسم، بلا منتجاتها هي",
      );
      assert.match(none.summary, /يُعرض الآن الكل/);
      const famArea = await memberScope(famA, ["area"]);
      assert.equal(await seen(famArea), "ABD");
      assert.match(
        famArea.summary,
        /^يُعرض الآن كل ما في .+\.$/,
        "سطر الحالة يسمّي المنطقة",
      );
      const famBoth = await memberScope(famA, ["similar", "area"]);
      assert.match(famBoth.summary, /ما يشبه منتجاتك من أسر أخرى \(.+\) في /);
      assert.equal(
        await seen(await memberScope(famA, ["similar", "area"])),
        "B",
        "المفتاحان معًا يجتمعان",
      );
      // مفتاح المندوب لا يعمل للأسرة.
      assert.equal((await memberScope(famA, ["coverage"])).filters, null);

      const customer = as(await mkUser("customer"), "customer");
      // «خياراتي»: بلا خيارات يُطلب منه الاختيار من قائمة الأقسام، ولا يُعرض شيء حتى يختار.
      const empty = await memberScope(customer, ["similar"]);
      assert.deepEqual(
        empty.options.map((o) => o.label),
        ["خياراتي", "منطقتي"],
      );
      assert.equal(await seen(empty), "");
      assert.equal(empty.needs, "interests");
      assert.equal(empty.editable, false);
      assert.equal(
        empty.summary,
        "اختر من الأقسام ما تحب ليعرض لك «خياراتي» ما يناسبها:",
      );
      // طلباته وحدها لا تصير خيارات: «خياراتي» ما اختاره بنفسه فقط.
      await pool.query(
        "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,'pending')",
        [
          randomUUID(),
          randomUUID(),
          customer.id,
          families.A.id,
          families.A.product,
        ],
      );
      assert.equal(
        (await memberScope(customer, ["similar"])).needs,
        "interests",
      );
      // يختار (قسم مجهول يُترك بصمت) فيعمل الخيار، ويظهر «عدّل خياراتي».
      const { saveInterests, getInterests } =
        await import("../src/server/member-interests");
      assert.deepEqual(
        (await saveInterests(customer, { categories: [c1, "no-such"] }))
          .categories,
        [c1],
      );
      assert.deepEqual(await getInterests(customer), [c1]);
      const liked = await memberScope(customer, ["similar"]);
      assert.equal(liked.needs, null);
      assert.equal(liked.editable, true);
      assert.equal(await seen(liked), "ABC");
      assert.match(liked.summary, /^يُعرض الآن من خياراتك \(.+\)\.$/);
      assert.equal(
        await seen(await memberScope(customer, ["area"], r2.region)),
        "C",
      );
      assert.equal(
        await seen(await memberScope(customer, ["similar", "area"], r1.region)),
        "AB",
      );
      // الكلمات من «نصوص الموقع»: تعديل الإدارة يظهر في اللوحة.
      assert.equal(
        (
          await memberScope(customer, [], "", {
            "mine.customerChoices": "ما أحب",
          })
        ).options[0].label,
        "ما أحب",
      );
      const noRegion = await memberScope(customer, ["area"], "");
      assert.equal(noRegion.needs, "region", "بلا منطقة: يُطلب تحديدها");
      assert.equal(noRegion.summary, "حدد منطقتك ليعمل «منطقتي»:");

      const courierUser = await mkUser("courier");
      await pool.query(
        `INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,status,national_id_encrypted)
         VALUES($1,$2,'مندوب الفلاتر',$3,'كامري','approved','\\x00')`,
        [randomUUID(), courierUser, r2.id],
      );
      const courier = as(courierUser, "courier");
      assert.deepEqual(
        (await memberScope(courier, [])).options.map((o) => o.key),
        ["coverage"],
      );
      const cov = await memberScope(courier, ["coverage"]);
      assert.equal(await seen(cov), "C");
      assert.match(cov.summary, /كل ما في تغطيتك: /);

      // العروض تتبع الفلاتر نفسها.
      for (const name of ["B", "C"])
        await pool.query(
          "INSERT INTO jdatna.offers(id,producer_id,product_id,title,description,terms,audience,meal,starts_at,ends_at,enabled) VALUES($1,$2,$3,'عرض فلتر','','شروط','general','lunch',now()-interval '1 hour',now()+interval '1 day',true)",
          [randomUUID(), families[name].id, families[name].product],
        );
      const offerNames = async (f: Awaited<ReturnType<typeof memberScope>>) =>
        (await listOffers(null, "", f.filters))
          .filter((o: { productId: string }) => ours.has(o.productId))
          .map((o: { productId: string }) => ours.get(o.productId))
          .sort()
          .join("");
      assert.equal(await offerNames(await memberScope(famA, ["area"])), "B");
      assert.equal(
        await offerNames(await memberScope(courier, ["coverage"])),
        "C",
      );
    } finally {
      const ids = Object.values(families);
      await pool.query(
        "DELETE FROM jdatna.offers WHERE producer_id=ANY($1::uuid[])",
        [ids.map((f) => f.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=ANY($1::uuid[])",
        [ids.map((f) => f.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=ANY($1::uuid[])",
        [ids.map((f) => f.product)],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])", [
        ids.map((f) => f.product),
      ]);
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [ids.map((f) => f.id)],
      );
      await pool.query(
        "DELETE FROM jdatna.member_interests WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
