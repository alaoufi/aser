import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { saveProfile, saveProduct, ownProfile } from "../src/server/management";
import { orderSnapshot } from "../src/server/orders";
import { todayProducts } from "../src/server/catalog";

test("order snapshot keeps kingdom shipping added on top of the price", () => {
  const base = { name: "جريش", unit: "صحن", price: 20, producerName: "أسرة" };
  assert.equal("shipping" in orderSnapshot(base), false);
  assert.deepEqual(
    orderSnapshot({ ...base, deliveryScope: "kingdom", shippingFee: "35.50" })
      .shipping,
    { scope: "kingdom", fee: 35.5 },
  );
  assert.deepEqual(
    orderSnapshot({ ...base, deliveryScope: "kingdom", shippingFee: null })
      .shipping,
    { scope: "kingdom", fee: null },
  );
});

test(
  "isolated delivery scope: family default at signup, inherited by new products, editable per product; today's table puts most ordered first",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const uid = randomUUID(),
      doc = randomUUID(),
      customer = randomUUID();
    let pid: string | undefined;
    const products: string[] = [];
    const user = {
      id: uid,
      name: "أسرة الشحن",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "customer" as const,
    };
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,$3,now())",
        [uid, user.phone, user.name],
      );
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,'عميل',now())",
        [
          customer,
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        ],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'other_document',$3,'application/pdf',10)",
        [doc, uid, "test/" + doc],
      );
      const city = (
        await pool.query(
          "SELECT c.id,c.region_id FROM jdatna.cities c ORDER BY c.id LIMIT 1",
        )
      ).rows[0];
      pid = (
        await saveProfile(user, {
          name: "أسرة الشحن",
          phone: user.phone,
          cityId: city.id,
          documentId: doc,
          documentType: "other_document",
          nationalId: "1234567890",
          workLocation: "موقع عمل خاص للاختبار",
          categoryIds: ["1"],
          deliveryScope: "kingdom",
          shippingFee: 30,
        })
      ).id;
      const own = await ownProfile(user);
      assert.equal(own.deliveryScope, "kingdom");
      assert.equal(own.shippingFee, 30);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='approved' WHERE id=$1",
        [pid],
      );
      const product = {
        description: "منتج اختبار الشحن",
        price: 20,
        unit: "صحن",
        status: "available",
        categoryIds: ["1"],
      };
      const read = async (id: string) =>
        (
          await pool.query(
            "SELECT delivery_scope,shipping_fee::float8 AS fee FROM jdatna.products WHERE id=$1",
            [id],
          )
        ).rows[0];
      // منتج جديد بلا اختيار: يأخذ افتراضي الأسرة.
      const inherited = (
        await saveProduct(user, { ...product, name: "طبق يرث" }, false)
      ).id;
      products.push(inherited);
      assert.deepEqual(await read(inherited), {
        delivery_scope: "kingdom",
        fee: 30,
      });
      // اختيار مختلف للمنتج: داخل التغطية ويُمسح الشحن.
      const local = (
        await saveProduct(
          user,
          {
            ...product,
            name: "طبق محلي",
            deliveryScope: "coverage",
            shippingFee: 99,
          },
          false,
        )
      ).id;
      products.push(local);
      assert.deepEqual(await read(local), {
        delivery_scope: "coverage",
        fee: null,
      });
      // التعديل بلا ذكر النطاق يحفظه كما هو.
      await saveProduct(
        user,
        { ...product, id: inherited, name: "طبق يرث معدل" },
        true,
      );
      assert.deepEqual(await read(inherited), {
        delivery_scope: "kingdom",
        fee: 30,
      });
      // مائدة اليوم: الأكثر طلبًا أولًا (المرفوض والملغى لا يُحسبان).
      for (const status of ["pending", "completed", "declined", "cancelled"])
        await pool.query(
          "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,$6)",
          [
            randomUUID(),
            randomUUID(),
            customer,
            pid,
            status === "pending" || status === "completed" ? local : inherited,
            status,
          ],
        );
      const order = (await todayProducts({ region: city.region_id }, 200))
        .filter((p) => products.includes(p.id))
        .map((p) => p.id);
      assert.deepEqual(order, [local, inherited]);
      const shipped = (
        await todayProducts({ region: city.region_id }, 200)
      ).find((p) => p.id === inherited);
      assert.equal(shipped?.deliveryScope, "kingdom");
      assert.equal(shipped?.shippingFee, 30);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE product_id=ANY($1::uuid[])",
        [products],
      );
      for (const id of products) {
        await pool.query(
          "DELETE FROM jdatna.product_categories WHERE product_id=$1",
          [id],
        );
        await pool.query(
          "DELETE FROM jdatna.product_allergens WHERE product_id=$1",
          [id],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [id]);
      }
      if (pid) {
        await pool.query(
          "DELETE FROM jdatna.producer_verifications WHERE producer_id=$1",
          [pid],
        );
        await pool.query(
          "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
          [pid],
        );
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          pid,
        ]);
      }
      await pool.query("DELETE FROM jdatna.producer_documents WHERE id=$1", [
        doc,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [uid, customer],
      ]);
      await pool.end();
    }
  },
);
