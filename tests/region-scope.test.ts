import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  browseLists,
  publicCategories,
  regionalProducers,
  regionalProducts,
} from "../src/server/catalog";
import { listOffers } from "../src/server/offers";

// صدق الفلاتر: كل ما يُعرض في نطاق العميل يصل إليه فعلًا، ويتغير بتغيير المنطقة.
test(
  "isolated region scope: home, families, categories, counts and offers follow the visitor's region",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = randomUUID().slice(0, 6);
    const [a, b] = (
      await pool.query(
        "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities ORDER BY region_id,id LIMIT 2",
      )
    ).rows as { id: string; region_id: string }[];
    // ثلاث أسر: في المنطقة (أ)، وفي (ب) تشحن للمملكة، وفي (ب) محلية فقط.
    const fam = { here: randomUUID(), ship: randomUUID(), far: randomUUID() };
    const users = [randomUUID(), randomUUID(), randomUUID()];
    const prod = { here: randomUUID(), ship: randomUUID(), far: randomUUID() };
    const offers = [randomUUID(), randomUUID(), randomUUID()];
    const cat = "rs" + tag;
    try {
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,$2,$1,'✦')",
        [cat, "قسم النطاق " + tag],
      );
      const plan = [
        [fam.here, users[0], a.id, prod.here, "coverage", "هنا"],
        [fam.ship, users[1], b.id, prod.ship, "kingdom", "شحن"],
        [fam.far, users[2], b.id, prod.far, "coverage", "بعيد"],
      ] as const;
      for (const [f, u, city, p, scope, label] of plan) {
        const phone =
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
          [u, "أسرة " + label, phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
          [f, u, "rs-" + f, `أسرة ${label} ${tag}`, city, phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
          [f, cat],
        );
        await pool.query(
          "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,delivery_scope) VALUES($1,$2,$3,'وصف',10,'صحن','preorder',$4)",
          [p, f, `طبق ${label} ${tag}`, scope],
        );
        await pool.query(
          "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
          [p, cat],
        );
      }
      for (const [i, f, p] of [
        [0, fam.here, prod.here],
        [1, fam.ship, prod.ship],
        [2, fam.far, prod.far],
      ] as const)
        await pool.query(
          `INSERT INTO jdatna.offers(id,producer_id,product_id,title,description,terms,price,audience,meal,starts_at,ends_at,enabled)
           VALUES($1,$2,$3,$4,'','شروط',5,'general','lunch',now()-interval '1 hour',now()+interval '1 day',true)`,
          [offers[i], f, p, "عرض " + i + " " + tag],
        );
      const mine = <T extends { name?: string; title?: string }>(l: T[]) =>
        l
          .map((x) => x.name ?? x.title ?? "")
          .filter((n) => n.endsWith(tag))
          .sort();

      // المنطقة (أ): المحلي أولًا، ثم ما يُشحن، ولا يظهر البعيد المحلي.
      const inA = await regionalProducts({ region: a.region_id });
      assert.deepEqual(mine(inA.local), [`طبق هنا ${tag}`]);
      assert.deepEqual(mine(inA.nationwide), [`طبق شحن ${tag}`]);
      const famA = await regionalProducers({ region: a.region_id });
      assert.deepEqual(mine(famA.local), [`أسرة هنا ${tag}`]);
      assert.deepEqual(mine(famA.nationwide), [`أسرة شحن ${tag}`]);
      // المنطقة (ب): تتغير النتائج فعلًا.
      const inB = await regionalProducts({ region: b.region_id });
      assert.deepEqual(mine(inB.local), [`طبق بعيد ${tag}`, `طبق شحن ${tag}`]);
      assert.deepEqual(mine(inB.nationwide), []);
      // بلا منطقة: الكل.
      const all = await regionalProducts({});
      assert.equal(mine(all.local).length, 3);

      // الأقسام: تظهر إن كان فيها ما يصل للعميل.
      assert.ok(
        (await publicCategories(a.region_id)).some((c) => c.id === cat),
      );
      // العدادات تطابق القوائم: في (أ) منتجان يصلان (المحلي والمشحون).
      const listsA = await browseLists({ region: a.region_id });
      assert.equal(listsA.categoryCounts[cat], 2);
      const dir = listsA.families.filter((f) => f.name.endsWith(tag));
      assert.deepEqual(dir.map((f) => f.name).sort(), [
        `أسرة شحن ${tag}`,
        `أسرة هنا ${tag}`,
      ]);
      assert.equal(dir[0].name, `أسرة هنا ${tag}`, "أسر المنطقة أولًا");

      // العروض: عروض المنطقة وما يُشحن، دون عروض الأسر البعيدة المحلية.
      const offersA = await listOffers(null, a.region_id);
      assert.deepEqual(mine(offersA), [`عرض 0 ${tag}`, `عرض 1 ${tag}`]);
      assert.equal(mine(await listOffers(null, "")).length, 3);

      // «غير متوفر» لا يُحسب ولا يُظهر القسم.
      await pool.query(
        "UPDATE jdatna.products SET status='unavailable' WHERE id=ANY($1::uuid[])",
        [[prod.here, prod.ship, prod.far]],
      );
      assert.equal(
        (await publicCategories(a.region_id)).some((c) => c.id === cat),
        false,
      );
      assert.equal(
        (await browseLists({ region: a.region_id })).categoryCounts[cat],
        undefined,
      );
    } finally {
      await pool.query("DELETE FROM jdatna.offers WHERE id=ANY($1::uuid[])", [
        offers,
      ]);
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE category_id=$1",
        [cat],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_categories WHERE category_id=$1",
        [cat],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])", [
        Object.values(prod),
      ]);
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [Object.values(fam)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=$1", [cat]);
    }
  },
);
