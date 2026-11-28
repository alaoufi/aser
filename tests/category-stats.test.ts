import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * «إحصائية الأقسام» (طلب المالك 2026-11-28): القسم الرئيسي يعدّ فروعه، بلا تكرار
 * للأسرة أو المنتج في فرعين، ودون الأسر المغلقة والمنتجات المحذوفة؛ و«المعروض الآن» للظاهر
 * المتوفر من أسرة معتمدة فقط.
 */
test(
  "category stats count families and products of a section with its sub-sections",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { adminCategories } = await import("../src/server/admin");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = "stat" + randomUUID().slice(0, 8);
    const main = tag + "-main",
      subA = tag + "-a",
      subB = tag + "-b";
    const users: string[] = [];
    const families: string[] = [];
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
      )
    ).rows[0].id;
    const family = async (status: string) => {
      const owner = randomUUID();
      users.push(owner);
      await pool.query(
        "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'أسرة','producer',now())",
        [
          owner,
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        ],
      );
      const id = randomUUID();
      families.push(id);
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة القسم',$4,'+966500000088',$5)",
        [id, owner, "st-" + id, city, status],
      );
      return id;
    };
    const product = async (
      fam: string,
      cats: string[],
      extra: { status?: string; visible?: boolean; deleted?: boolean } = {},
    ) => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible,deleted_at) VALUES($1,$2,'طبق','وصف','صحن',$3,$4,$5)",
        [
          id,
          fam,
          extra.status ?? "available",
          extra.visible ?? true,
          extra.deleted ? new Date() : null,
        ],
      );
      for (const c of cats)
        await pool.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [id, c],
        );
    };
    try {
      await pool.query(
        `INSERT INTO jdatna.categories(id,name,slug,icon,parent_id) VALUES
          ($1,'رئيسي',$1,'✦',NULL),($2,'فرع أ',$2,'✦',$1),($3,'فرع ب',$3,'✦',$1)`,
        [main, subA, subB],
      );
      const open = await family("approved");
      const waiting = await family("pending");
      const closed = await family("closed");
      for (const [f, cats] of [
        [open, [subA, subB]],
        [waiting, [subA]],
        [closed, [subB]],
      ] as const)
        for (const c of cats)
          await pool.query(
            "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
            [f, c],
          );
      await product(open, [subA, subB]); // في فرعين: يُعدّ مرة في الرئيسي
      await product(open, [subA], { status: "unavailable" });
      await product(open, [subB], { visible: false });
      await product(open, [subB], { deleted: true });
      await product(waiting, [subA]); // أسرة غير معتمدة: ليس معروضًا
      const admin = { id: randomUUID(), role: "admin" } as never;
      const all = await adminCategories(admin);
      const stat = (id: string) => all.find((c) => c.id === id)?.stats;
      assert.deepEqual(stat(main), { families: 2, products: 4, live: 1 });
      assert.deepEqual(stat(subA), { families: 2, products: 3, live: 1 });
      assert.deepEqual(stat(subB), { families: 1, products: 2, live: 1 });
    } finally {
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE category_id = ANY($1::text[])",
        [[main, subA, subB]],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_categories WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.query(
        "DELETE FROM jdatna.categories WHERE id = ANY($1::text[])",
        [[subA, subB, main]],
      );
    }
  },
);
