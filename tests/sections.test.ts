import { test } from "node:test";
import assert from "node:assert/strict";
import { categories } from "../src/server/constants";
import { moderationSchema } from "../src/server/admin";
test("dairy and drinks are distinct canonical sections with valid icons", () => {
  for (const name of ["منتجات الألبان", "المشروبات"]) {
    const c = categories.find((x) => x.name === name);
    assert.ok(c, name);
    assert.ok(c.icon);
  }
  assert.equal(new Set(categories.map((x) => x.id)).size, categories.length);
});
test("canonical dairy and drinks children have stable descriptive IDs and one-level parents", () => {
  const expected = [
    ["dairy-laban", "لبن", "13"],
    ["dairy-aqt", "أقط", "13"],
    ["dairy-ghee", "سمن", "13"],
    ["dairy-qeshed", "قشد", "13"],
    ["dairy-butter", "زبد", "13"],
    ["drinks-hot", "مشروبات ساخنة", "14"],
    ["drinks-cold", "مشروبات باردة", "14"],
  ];
  for (const [id, name, parentId] of expected) {
    const child = categories.find((c) => c.id === id);
    assert.equal(child?.name, name);
    assert.equal(child?.parentId, parentId);
    assert.ok(!categories.find((c) => c.id === parentId)?.parentId);
  }
});
test("admin can assign all14 sections with bounded payload", () => {
  const input = {
    id: "00000000-0000-4000-8000-000000000001",
    categoryIds: Array.from({ length: 14 }, (_, i) => String(i + 1)),
    reason: "تحديث تصنيفات المنتج",
  };
  assert.equal(moderationSchema.safeParse(input).success, true);
  assert.equal(
    moderationSchema.safeParse({ ...input, categoryIds: Array(101).fill("1") })
      .success,
    false,
  );
});
import { documentType } from "../src/server/validation";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { saveCategory } from "../src/server/admin";
import {
  getCategories,
  searchProducts,
  searchProducers,
} from "../src/server/catalog";
test("families can submit another eligibility document for admin review", () => {
  assert.equal(documentType.safeParse("other_document").success, true);
});
test(
  "isolated nested categories enforce one-level parents and parent catalog filters",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const uid = randomUUID(),
      pid = randomUUID(),
      productId = randomUUID(),
      tag = randomUUID().slice(0, 8),
      rootId = `section-${tag}`;
    const user = {
      id: uid,
      name: "section fixture",
      phone: `section-${tag}`,
      role: "admin" as const,
    };
    let childId: string | undefined;
    try {
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'section fixture','admin',now())",
        [uid, user.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,'قسم الاختبار',$2,'🥛')",
        [rootId, rootId],
      );
      childId = (
        await saveCategory(
          user,
          {
            name: "لبن الاختبار",
            slug: `child-${tag}`,
            icon: "🥛",
            parentId: rootId,
          },
          false,
        )
      ).id;
      assert.equal(
        (await getCategories()).find((c) => c.id === childId)?.parentId,
        rootId,
      );
      await assert.rejects(
        saveCategory(
          user,
          {
            name: "مستوى ثالث",
            slug: `grand-${tag}`,
            icon: "🥛",
            parentId: childId,
          },
          false,
        ),
        { status: 400 },
      );
      await assert.rejects(
        saveCategory(
          user,
          {
            id: rootId,
            name: "قسم الاختبار",
            slug: rootId,
            icon: "🥛",
            parentId: childId,
          },
          true,
        ),
        { status: 400 },
      );
      await assert.rejects(
        saveCategory(
          user,
          {
            id: childId,
            name: "لبن الاختبار",
            slug: `child-${tag}`,
            icon: "🥛",
            parentId: childId,
          },
          true,
        ),
        { status: 400 },
      );
      await saveCategory(
        user,
        { id: childId, name: "لبن الاختبار", slug: `child-${tag}`, icon: "🥛" },
        true,
      );
      assert.equal(
        (await getCategories()).find((c) => c.id === childId)?.parentId,
        rootId,
        "legacy edit preserves parent",
      );
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$3,$4,$5,'approved')",
        [pid, uid, `section-${tag}`, city, user.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,$3,'fixture','unit','available')",
        [productId, pid, `nested-${tag}`],
      );
      await pool.query(
        "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
        [productId, childId],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
        [pid, childId],
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: rootId, city })
        ).some((p) => p.id === productId),
        true,
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: childId, city })
        ).some((p) => p.id === productId),
        true,
      );
      assert.equal(
        (
          await searchProducers({ q: `section-${tag}`, category: rootId, city })
        ).some((p) => p.id === pid),
        true,
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=$1",
        [productId],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query(
        "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
        [pid],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        pid,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [uid],
      );
      if (childId)
        await pool.query("DELETE FROM jdatna.categories WHERE id=$1", [
          childId,
        ]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=$1", [rootId]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [uid]);
      await pool.end();
    }
  },
);
