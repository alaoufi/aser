import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { profileSchema } from "../src/server/validation";
import { db } from "../src/server/db";
import { saveProfile, ownProfile, saveProduct } from "../src/server/management";
import {
  getProducer,
  getProduct,
  searchProducers,
} from "../src/server/catalog";
const basic = {
  name: "الاسم الشخصي للاختبار",
  phone: "+966500000001",
  cityId: "riyadh",
  documentId: "00000000-0000-4000-8000-000000000001",
  documentType: "other_document",
  nationalId: "1234567890",
  workLocation: "موقع عمل خاص للاختبار",
};
test("trade name is optional and bounded and explicit empty is allowed to clear", () => {
  assert.equal(
    profileSchema.parse({ ...basic, tradeName: "  مذاق جدتنا  " }).tradeName,
    "مذاق جدتنا",
  );
  assert.equal(
    profileSchema.safeParse({ ...basic, tradeName: "x".repeat(121) }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...basic, tradeName: "" }).success,
    true,
  );
});
test(
  "isolated optional trade name display, preservation, clearing and both-name search",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const uid = randomUUID(),
      doc = randomUUID();
    let pid: string | undefined;
    let productId: string | undefined;
    const user = {
      id: uid,
      name: "اسم المالك",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "customer" as const,
    };
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,phone_verified_at)VALUES($1,$2,$3,now())",
        [uid, user.phone, user.name],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size)VALUES($1,$2,'other_document',$3,'application/pdf',10)",
        [doc, uid, "test/" + doc],
      );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      const data = {
        ...basic,
        phone: user.phone,
        cityId: city,
        documentId: doc,
        name: "اسم-شخصي-" + uid,
      };
      pid = (await saveProfile(user, { ...data, tradeName: "تجاري-" + uid }))
        .id;
      assert.equal((await ownProfile(user)).tradeName, "تجاري-" + uid);
      await saveProfile(user, data);
      assert.equal((await ownProfile(user)).tradeName, "تجاري-" + uid);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='approved'WHERE id=$1",
        [pid],
      );
      assert.equal((await getProducer("family-" + pid))?.name, "تجاري-" + uid);
      for (const q of [data.name, "تجاري-" + uid])
        assert.ok((await searchProducers({ q })).some((p) => p.id === pid));
      productId = (
        await saveProduct(
          user,
          {
            name: "طبق اسم تجاري",
            description: "وصف منتج اختبار الاسم التجاري",
            price: 12,
            unit: "طبق",
            status: "available",
            categoryIds: ["12"],
          },
          false,
        )
      ).id;
      assert.equal((await getProduct(productId))?.producerName, "تجاري-" + uid);
      await saveProfile(user, { ...data, tradeName: "" });
      assert.equal((await ownProfile(user)).tradeName, null);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='approved'WHERE id=$1",
        [pid],
      );
      assert.equal((await getProducer("family-" + pid))?.name, data.name);
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
      await pool.end();
    }
  },
);
