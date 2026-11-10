import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { manageProduct, ownProducts } from "../src/server/management";
import {
  moderateProduct,
  saveCategory,
  setCategoryHidden,
} from "../src/server/admin";
import { getCategories } from "../src/server/catalog";

test(
  "isolated product management: families hide, show and delete their products; admin hides categories",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "producer" | "admin", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
      permissions: [] as string[],
    });
    const family = mk("producer", "أسرة المنتجات"),
      other = mk("producer", "أسرة أخرى"),
      admin = mk("admin", "مدير");
    const created: string[] = [];
    const familyId = randomUUID(),
      productId = randomUUID(),
      categoryId = "t" + Math.floor(Math.random() * 1e6);
    try {
      for (const u of [family, other, admin])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ',$4,$5,'approved')",
        [familyId, family.id, "pm-" + familyId.slice(0, 8), city, family.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'جريش','وصف','صحن','available')",
        [productId, familyId],
      );
      const visible = async () =>
        (
          await pool.query(
            "SELECT visible,hidden_by,deleted_at FROM jdatna.products WHERE id=$1",
            [productId],
          )
        ).rows[0];

      await assert.rejects(
        manageProduct(other, { id: productId, action: "hide" }),
        { status: 404 },
        "only the owner",
      );
      await manageProduct(family, { id: productId, action: "hide" });
      assert.deepEqual(
        { ...(await visible()), deleted_at: null },
        { visible: false, hidden_by: "family", deleted_at: null },
      );
      assert.equal((await ownProducts(family))[0].visible, false);
      await manageProduct(family, { id: productId, action: "show" });
      assert.equal((await visible()).visible, true);

      // إخفاء الإدارة لا تلغيه الأسرة.
      await moderateProduct(admin, {
        id: productId,
        visible: false,
        reason: "مراجعة المحتوى",
      });
      assert.equal((await visible()).hidden_by, "admin");
      await assert.rejects(
        manageProduct(family, { id: productId, action: "show" }),
        { status: 403 },
      );
      await moderateProduct(admin, {
        id: productId,
        visible: true,
        reason: "تمت المراجعة",
      });

      // الحذف أرشفة: يختفي من الأسرة والزوار.
      await manageProduct(family, { id: productId, action: "delete" });
      const gone = await visible();
      assert.equal(gone.visible, false);
      assert.ok(gone.deleted_at);
      assert.equal((await ownProducts(family)).length, 0);
      await assert.rejects(
        manageProduct(family, { id: productId, action: "show" }),
        { status: 404 },
      );

      // القسم المخفي لا يظهر للزوار والأسر، ويظهر للإدارة.
      await pool.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) VALUES($1,'قسم مؤقت',$2,'✦')",
        [categoryId, "tmp-" + categoryId],
      );
      await setCategoryHidden(admin, { id: categoryId, hidden: true });
      assert.equal(
        (await getCategories()).some((c) => c.id === categoryId),
        false,
      );
      assert.equal(
        (await getCategories(true)).find((c) => c.id === categoryId)?.hidden,
        true,
      );
      await assert.rejects(
        setCategoryHidden(family, { id: categoryId, hidden: false }),
        { status: 403 },
      );
      await setCategoryHidden(admin, { id: categoryId, hidden: false });
      assert.ok((await getCategories()).some((c) => c.id === categoryId));

      // قسم جديد بلا رابط مختصر: يُنشأ داخليًا، ويبقى عند التعديل.
      const made = await saveCategory(
        admin,
        { name: "قسم بلا رابط", icon: "✦" },
        false,
      );
      created.push(made.id);
      const slugOf = async () =>
        (
          await pool.query("SELECT slug FROM jdatna.categories WHERE id=$1", [
            made.id,
          ])
        ).rows[0].slug;
      assert.equal(await slugOf(), `cat-${made.id}`);
      await saveCategory(
        admin,
        { id: made.id, name: "قسم معدل", icon: "✦" },
        true,
      );
      assert.equal(await slugOf(), `cat-${made.id}`);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.categories WHERE id=ANY($1::text[])",
        [[categoryId, ...created]],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [[family.id, other.id, admin.id]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [family.id, other.id, admin.id],
      ]);
      await pool.end();
    }
  },
);
