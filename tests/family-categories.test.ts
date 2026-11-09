import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  saveProfile,
  saveProducerCategories,
  saveProduct,
  ownProfile,
} from "../src/server/management";
import { publicCategories } from "../src/server/catalog";
import { visibleCategoryTree } from "../src/lib/category-label";

test("public category tree keeps used categories and their ancestors only", () => {
  const all = [
    { id: "a", name: "أ", slug: "a", icon: "✦", parentId: null },
    { id: "b", name: "ب", slug: "b", icon: "✦", parentId: "a" },
    { id: "c", name: "ج", slug: "c", icon: "✦", parentId: null },
  ];
  assert.deepEqual(
    visibleCategoryTree(all, ["b"]).map((c) => c.id),
    ["a", "b"],
  );
  assert.deepEqual(visibleCategoryTree(all, []), []);
});

test(
  "isolated family categories: required at signup, editable without review, gate products and public visibility",
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
      tag = randomUUID().slice(0, 8);
    const catA = "fc-a-" + tag,
      catB = "fc-b-" + tag;
    let pid: string | undefined;
    let productId: string | undefined;
    const user = {
      id: uid,
      name: "أسرة أقسام",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "customer" as const,
    };
    try {
      for (const id of [catA, catB])
        await pool.query(
          "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,$1,$1,'✦')",
          [id],
        );
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,phone_verified_at) VALUES($1,$2,$3,now())",
        [uid, user.phone, user.name],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'other_document',$3,'application/pdf',10)",
        [doc, uid, "test/" + doc],
      );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      const data = {
        name: "أسرة أقسام " + tag,
        phone: user.phone,
        cityId: city,
        documentId: doc,
        documentType: "other_document",
        nationalId: "1234567890",
        workLocation: "موقع عمل خاص للاختبار",
      };
      // التسجيل يتطلب قسمًا واحدًا على الأقل.
      await assert.rejects(saveProfile(user, data), /قسمًا واحدًا/);
      pid = (await saveProfile(user, { ...data, categoryIds: [catA] })).id;
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='approved' WHERE id=$1",
        [pid],
      );
      const visible = async (id: string) =>
        (await publicCategories()).some((c) => c.id === id);
      assert.equal(await visible(catA), false, "chosen but no product: hidden");

      // المنتج من أقسام الأسرة فقط.
      const product = {
        name: "منتج أقسام",
        description: "وصف منتج اختبار الأقسام",
        price: 10,
        unit: "طبق",
        status: "available",
      };
      await assert.rejects(
        saveProduct(user, { ...product, categoryIds: [catB] }, false),
        /من أقسامك فقط/,
      );
      productId = (
        await saveProduct(user, { ...product, categoryIds: [catA] }, false)
      ).id;
      assert.equal(await visible(catA), true, "chosen and has product: shown");
      assert.equal(await visible(catB), false, "nobody chose it: hidden");

      // تعديل الأقسام لاحقًا لا يعيد الملف للمراجعة، ولا يزيل قسمًا عليه منتجات.
      await saveProducerCategories(user, { categoryIds: [catA, catB] });
      assert.deepEqual((await ownProfile(user)).categoryIds.sort(), [
        catA,
        catB,
      ]);
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=$1",
            [pid],
          )
        ).rows[0].status,
        "approved",
      );
      assert.equal(await visible(catB), false, "chosen but no product: hidden");
      await assert.rejects(
        saveProducerCategories(user, { categoryIds: [catB] }),
        { status: 409 },
      );
      await assert.rejects(
        saveProducerCategories(user, { categoryIds: ["missing-" + tag] }),
        { status: 400 },
      );
      // منتج مخفي لا يُظهر القسم.
      await pool.query("UPDATE jdatna.products SET visible=false WHERE id=$1", [
        productId,
      ]);
      assert.equal(await visible(catA), false, "hidden product: hidden");
    } finally {
      if (productId) {
        await pool.query(
          "DELETE FROM jdatna.product_categories WHERE product_id=$1",
          [productId],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
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
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [uid]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=ANY($1)", [
        [catA, catB],
      ]);
      await pool.end();
    }
  },
);
