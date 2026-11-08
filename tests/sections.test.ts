import { test } from "node:test";
import assert from "node:assert/strict";
import { categories } from "../src/server/constants";
import { moderationSchema } from "../src/server/admin";
import {
  categoryLabel,
  categoryParentOptions,
  sortCategoryTree,
  canReparentCategory,
} from "../src/lib/category-label";
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
    ["dairy-laban", "ألبان", "13"],
    ["dairy-aqt", "أقط", "13"],
    ["dairy-ghee", "سمن", "13"],
    ["dairy-qeshed", "قشد", "13"],
    ["dairy-butter", "زبد", "13"],
    ["drinks-hot", "مشروبات ساخنة", "14"],
    ["drinks-cold", "مشروبات باردة", "14"],
    ["dairy-other", "منتجات ألبان أخرى", "13"],
  ];
  for (const [id, name, parentId] of expected) {
    const child = categories.find((c) => c.id === id);
    assert.equal(child?.name, name);
    assert.equal(child?.parentId, parentId);
    assert.ok(!categories.find((c) => c.id === parentId)?.parentId);
  }
});
test("hot drinks have explicit nested examples and full breadcrumbs", () => {
  for (const [id, name] of [
    ["hot-tea", "شاهي"],
    ["hot-coffee", "قهوة"],
    ["hot-milk", "حليب"],
  ]) {
    const c = categories.find((x) => x.id === id);
    assert.ok(c);
    assert.equal(c.parentId, "drinks-hot");
    assert.equal(
      categoryLabel(c, categories),
      `المشروبات — مشروبات ساخنة — ${name}`,
    );
  }
  const sorted = sortCategoryTree([...categories].reverse());
  assert.ok(
    sorted.findIndex((c) => c.id === "14") <
      sorted.findIndex((c) => c.id === "drinks-hot"),
  );
  assert.ok(
    sorted.findIndex((c) => c.id === "drinks-hot") <
      sorted.findIndex((c) => c.id === "hot-tea"),
  );
  assert.ok(
    !categoryParentOptions(categories, "drinks-hot").some(
      (c) => c.id === "hot-tea" || c.id === "drinks-hot",
    ),
  );
});
test("category moves include descendant height and exclude cycles/depth-nine parents", () => {
  const all = Array.from({ length: 8 }, (_, i) => ({
    id: `d${i + 1}`,
    name: `level${i + 1}`,
    slug: `d${i + 1}`,
    icon: "x",
    parentId: i ? `d${i}` : null,
  }));
  assert.equal(canReparentCategory(all, "d1", "d3"), false);
  assert.equal(canReparentCategory(all, undefined, "d8"), false);
  assert.equal(canReparentCategory(all, undefined, "d7"), true);
  assert.equal(canReparentCategory(all, "d2", "d3"), false);
  assert.equal(categoryLabel(all[7], all).split(" — ").length, 8);
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
  "isolated category tree enforces cycles/depth/subtree moves and recursive catalog filters",
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
    const descendants: string[] = [];
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
      descendants.push(childId);
      assert.equal(
        (await getCategories()).find((c) => c.id === childId)?.parentId,
        rootId,
      );
      const grandId = (
        await saveCategory(
          user,
          {
            name: "مستوى ثالث",
            slug: `grand-${tag}`,
            icon: "🥛",
            parentId: childId,
          },
          false,
        )
      ).id;
      descendants.push(grandId);
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
        [productId, grandId],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
        [pid, grandId],
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: rootId, city })
        ).some((p) => p.id === productId),
        true,
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: grandId, city })
        ).some((p) => p.id === productId),
        true,
      );
      await assert.rejects(
        pool.query("UPDATE jdatna.categories SET parent_id=$2 WHERE id=$1", [
          rootId,
          grandId,
        ]),
        { code: "23514" },
      );
      let deepest = grandId;
      for (let depth = 4; depth <= 8; depth++) {
        deepest = (
          await saveCategory(
            user,
            {
              name: `مستوى ${depth}`,
              slug: `depth-${depth}-${tag}`,
              icon: "🥛",
              parentId: deepest,
            },
            false,
          )
        ).id;
        descendants.push(deepest);
      }
      await assert.rejects(
        saveCategory(
          user,
          {
            name: "مستوى تاسع",
            slug: `depth-nine-${tag}`,
            icon: "🥛",
            parentId: deepest,
          },
          false,
        ),
        { status: 400 },
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO jdatna.categories(id,name,slug,icon,parent_id) VALUES($1,'ninth',$1,'x',$2)",
          [`ninth-${tag}`, deepest],
        ),
        { code: "23514" },
      );
      const depthSeven = descendants.at(-2)!;
      const alternateId = (
        await saveCategory(
          user,
          { name: "جذر مخصص", slug: `custom-${tag}`, icon: "⭐" },
          false,
        )
      ).id;
      // Place this root first for reverse cleanup after its moved descendants.
      descendants.unshift(alternateId);
      await saveCategory(
        user,
        {
          id: childId,
          name: "لبن الاختبار",
          slug: `child-${tag}`,
          icon: "🥛",
          parentId: alternateId,
        },
        true,
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: rootId, city })
        ).some((p) => p.id === productId),
        false,
      );
      assert.equal(
        (
          await searchProducts({
            q: `nested-${tag}`,
            category: alternateId,
            city,
          })
        ).some((p) => p.id === productId),
        true,
      );
      const alternate = (await getCategories()).find(
        (c) => c.id === alternateId,
      )!;
      assert.equal(alternate.name, "جذر مخصص");
      assert.equal(alternate.slug, `custom-${tag}`);
      assert.equal(alternate.icon, "⭐");
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon,parent_id) VALUES($1,'ignored seed',$2,'x',$3) ON CONFLICT DO NOTHING",
        [alternateId, `ignored-${tag}`, deepest],
      );
      const preserved = (await getCategories()).find(
        (c) => c.id === alternateId,
      )!;
      assert.equal(preserved.name, "جذر مخصص");
      assert.equal(
        preserved.parentId,
        null,
        "idempotent seed preserves customized root hierarchy",
      );
      const branch = (
        await saveCategory(
          user,
          { name: "فرع متحرك", slug: `branch-${tag}`, icon: "x" },
          false,
        )
      ).id;
      descendants.push(branch);
      const leaf = (
        await saveCategory(
          user,
          {
            name: "ورقة متحركة",
            slug: `leaf-${tag}`,
            icon: "x",
            parentId: branch,
          },
          false,
        )
      ).id;
      descendants.push(leaf);
      await assert.rejects(
        saveCategory(
          user,
          {
            id: branch,
            name: "فرع متحرك",
            slug: `branch-${tag}`,
            icon: "x",
            parentId: depthSeven,
          },
          true,
        ),
        { status: 400 },
      );
      await assert.rejects(
        pool.query("UPDATE jdatna.categories SET parent_id=$2 WHERE id=$1", [
          branch,
          depthSeven,
        ]),
        { code: "23514" },
      );
      assert.equal(
        (
          await searchProducts({ q: `nested-${tag}`, category: childId, city })
        ).some((p) => p.id === productId),
        true,
      );
      assert.equal(
        (
          await searchProducers({
            q: `section-${tag}`,
            category: alternateId,
            city,
          })
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
      for (const descendant of descendants.reverse())
        await pool.query("DELETE FROM jdatna.categories WHERE id=$1", [
          descendant,
        ]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=$1", [rootId]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [uid]);
      await pool.end();
    }
  },
);
