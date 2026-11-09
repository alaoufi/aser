import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  normalizeArabic,
  searchWords,
  searchProducts,
  searchProducers,
  browseLists,
} from "../src/server/catalog";
import { db } from "../src/server/db";

test("Arabic search text is normalized for hamza, taa marbuta, alef maqsura and diacritics", () => {
  assert.equal(
    normalizeArabic("أكلةٌ إيدامٍ آخر مرقوقـــة"),
    "اكله ايدام اخر مرقوقه",
  );
  assert.equal(normalizeArabic("حلوى"), "حلوي");
  assert.deepEqual(searchWords("المرقوقة"), ["مرقوق"]);
  assert.deepEqual(searchWords("  الجريش  بالدجاج، أرز "), [
    "جريش",
    "بالدجاج",
    "ارز",
  ]);
  assert.deepEqual(searchWords("الرز"), ["الرز"], "short words keep ال");
  assert.deepEqual(searchWords(""), []);
  assert.equal(searchWords("a b c d e f g h").length, 6);
});

test(
  "isolated catalog search is tolerant, available-first and filters by family",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const name = (await db().query("SELECT current_database() AS name")).rows[0]
      .name as string;
    assert.ok(
      name.startsWith("jdatna_test_"),
      "Requires jdatna_test_ database",
    );
    const tag = randomUUID().slice(0, 8);
    const city = (
      await db().query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id as string;
    const users = [randomUUID(), randomUUID()];
    const producers = [randomUUID(), randomUUID()];
    const slugs = producers.map((id) => "search-" + id);
    const products = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    try {
      for (let i = 0; i < 2; i++) {
        const phone =
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
        await db().query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'بحث',$2,'producer',now())",
          [users[i], phone],
        );
        await db().query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [
            producers[i],
            users[i],
            slugs[i],
            `أسرة أم ${tag} ${i}`,
            city,
            phone,
          ],
        );
      }
      const insert = (
        id: string,
        producer: string,
        title: string,
        status: string,
      ) =>
        db().query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,$3,'وصف',10,'صحن',$4)",
          [id, producer, title, status],
        );
      await insert(products[0], producers[0], `مرقوقة ${tag}`, "preorder");
      await insert(products[1], producers[0], `إدام مرقوق ${tag}`, "available");
      await insert(
        products[2],
        producers[1],
        `مرقوق قديم ${tag}`,
        "unavailable",
      );
      await insert(products[3], producers[1], `كبسة ${tag}`, "available");

      const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
      // همزة/تاء مربوطة/ال التعريف: «المرقوقه» تطابق «مرقوقة» و«مرقوق».
      const found = ids(await searchProducts({ q: `المرقوقه ${tag}` }));
      assert.deepEqual(found, [products[1], products[0]]);
      const tolerant = ids(await searchProducts({ q: `مرقوق ${tag}` }));
      assert.deepEqual(
        tolerant,
        [products[1], products[0]],
        "available before preorder; unavailable hidden by default",
      );
      assert.ok(
        ids(
          await searchProducts({ q: `مرقوق ${tag}`, include: "all" }),
        ).includes(products[2]),
      );
      assert.deepEqual(
        ids(await searchProducts({ q: `ادام ${tag}` })),
        [products[1]],
        "إدام without hamza",
      );
      // اسم الأسرة المنتجة يطابق منتجاتها، وفلتر الأسرة المنتجة يعرض منتجاتها المتاحة فقط.
      assert.deepEqual(ids(await searchProducts({ producer: slugs[1] })), [
        products[3],
      ]);
      assert.deepEqual(
        ids(await searchProducers({ q: `ام ${tag}` })).sort(),
        [...producers].sort(),
      );
      assert.deepEqual(ids(await searchProducts({ q: `زززز ${tag}` })), []);
      // توسيع الدائرة: كلمة غير موجودة مع كلمة موجودة تكفي في وضع «any».
      assert.deepEqual(
        ids(await searchProducts({ q: `كبسة زززز ${tag}` })),
        [],
      );
      assert.ok(
        ids(
          await searchProducts({ q: `كبسة زززز ${tag}`, match: "any" }),
        ).includes(products[3]),
      );
      // قوائم التصفح: عدد المتاح لكل أسرة لا يشمل غير المتوفر.
      const lists = await browseLists({ city });
      const counts = Object.fromEntries(
        lists.families.map((f) => [f.slug, f.available]),
      );
      assert.equal(counts[slugs[0]], 2);
      assert.equal(counts[slugs[1]], 1);
      assert.equal(typeof lists.categoryCounts, "object");
    } finally {
      await db().query("DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])", [
        products,
      ]);
      await db().query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producers],
      );
      await db().query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
    }
  },
);
