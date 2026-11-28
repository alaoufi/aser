import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { saveProducerCategories } from "../src/server/management";
import { deleteCategory, saveCategory } from "../src/server/admin";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated category removal: deleted products never block; live products need confirmation and are then deleted or unlinked",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = randomUUID().slice(0, 8);
    const owner: SessionUser = {
      id: randomUUID(),
      name: "أسرة الأقسام",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer",
    };
    const admin: SessionUser = { ...owner, id: randomUUID(), role: "admin" };
    admin.phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const familyId = randomUUID();
    const cats: string[] = [];
    const products: string[] = [];
    try {
      for (const u of [owner, admin])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      for (const n of ["أ", "ب", "ج"])
        cats.push(
          (
            await saveCategory(
              admin,
              {
                name: `قسم ${n} ${tag}`,
                slug: `cat-${n.charCodeAt(0)}-${tag}`,
                icon: "✦",
              },
              false,
            )
          ).id,
        );
      const [a, b, c] = cats;
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الأقسام',$4,$5,'approved')",
        [familyId, owner.id, "cats-" + tag, city, owner.phone],
      );
      for (const cat of [a, b])
        await pool.query(
          "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
          [familyId, cat],
        );
      const product = async (
        name: string,
        categories: string[],
        deleted = false,
      ) => {
        const id = randomUUID();
        products.push(id);
        await pool.query(
          `INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,deleted_at) VALUES($1,$2,$3,'وصف',10,'صحن','available',${deleted ? "now()" : "NULL"})`,
          [id, familyId, name],
        );
        for (const cat of categories)
          await pool.query(
            "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
            [id, cat],
          );
        return id;
      };
      const old = await product("منتج محذوف سابقًا", [a], true);
      const onlyA = await product("هريس", [a]);
      const both = await product("كليجا", [a, b]);

      // الإضافة وحدها لا تُرفض بسبب منتجات محذوفة سابقًا.
      // إزالة «أ» وعليه منتج قائم: يُطلب تأكيد، ولا يتغير شيء.
      await assert.rejects(
        saveProducerCategories(owner, { categoryIds: [b, c] }),
        (e: {
          status: number;
          details?: { confirm?: boolean };
          message: string;
        }) =>
          e.status === 409 &&
          e.details?.confirm === true &&
          /هريس/.test(e.message),
      );
      assert.equal(
        (
          await pool.query(
            "SELECT deleted_at FROM jdatna.products WHERE id=$1",
            [onlyA],
          )
        ).rows[0].deleted_at,
        null,
      );
      // بالتأكيد: «هريس» (بلا قسم آخر) يُحذف، و«كليجا» تُفصل عن «أ» وتبقى في «ب».
      const saved = await saveProducerCategories(owner, {
        categoryIds: [b, c],
        removeProducts: true,
      });
      assert.deepEqual(saved.categoryIds.sort(), [b, c].sort());
      assert.ok(
        (
          await pool.query(
            "SELECT deleted_at FROM jdatna.products WHERE id=$1",
            [onlyA],
          )
        ).rows[0].deleted_at,
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT category_id FROM jdatna.product_categories WHERE product_id=$1",
            [both],
          )
        ).rows.map((r) => r.category_id),
        [b],
      );

      // الإدارة: حذف «ب» وعليه «كليجا»: تنبيه بالعدد والعمر، ثم الحذف بالتأكيد.
      await assert.rejects(
        deleteCategory(admin, { id: b }),
        (e: {
          status: number;
          details?: { confirm?: boolean };
          message: string;
        }) =>
          e.status === 409 &&
          e.details?.confirm === true &&
          /اليوم/.test(e.message),
      );
      await deleteCategory(admin, { id: b, deleteProducts: true });
      cats.splice(cats.indexOf(b), 1);
      assert.ok(
        (
          await pool.query(
            "SELECT deleted_at FROM jdatna.products WHERE id=$1",
            [both],
          )
        ).rows[0].deleted_at,
      );
      // «أ» لم يبق عليه إلا منتج محذوف سابقًا: يُحذف دون تأكيد.
      await deleteCategory(admin, { id: a });
      cats.splice(cats.indexOf(a), 1);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.product_categories WHERE product_id=$1",
            [old],
          )
        ).rows[0].n,
        0,
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=ANY($1::uuid[])",
        [products],
      );
      await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
        familyId,
      ]);
      await pool.query(
        "DELETE FROM jdatna.producer_categories WHERE producer_id=$1",
        [familyId],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query(
        "DELETE FROM jdatna.categories WHERE id=ANY($1::text[])",
        [cats],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [owner.id, admin.id],
      ]);
    }
  },
);
