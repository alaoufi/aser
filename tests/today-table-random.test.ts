import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * «مائدة اليوم» (قرار المالك 2026-11-28): ترتيب عشوائي يتغير مع كل تحديث، والمعروض القابل للطلب
 * فقط: جاهز والأسرة تطبخ اليوم، أو حسب الطلب. غير المتوفر، والمخفي، والأسرة الموقوفة أو المخفية،
 * والجاهز وأسرته «لا تطبخ اليوم» — لا تظهر.
 */
test(
  "today's table shows only orderable dishes, in a random order on every refresh",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { todayProducts } = await import("../src/server/catalog");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const city = (
      await pool.query(
        "SELECT id,region_id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
      )
    ).rows[0];
    const users: string[] = [];
    const families: string[] = [];
    const mkFamily = async (status: string) => {
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
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المائدة',$4,'+966500000066',$5)",
        [id, owner, "rnd-" + id, city.id, status],
      );
      return id;
    };
    const dish = async (
      family: string,
      status: string,
      visible = true,
    ): Promise<string> => {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق','وصف','صحن',$3,$4)",
        [id, family, status, visible],
      );
      return id;
    };
    try {
      const open = await mkFamily("approved");
      const resting = await mkFamily("approved");
      const hidden = await mkFamily("hidden");
      const stopped = await mkFamily("suspended");
      // الأسرة «لا تطبخ اليوم».
      await pool.query(
        "INSERT INTO jdatna.producer_cooking_days(producer_id,day) VALUES($1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date)",
        [resting],
      );
      const shown = [
        await dish(open, "available"),
        await dish(open, "preorder"),
        await dish(open, "available"),
        await dish(open, "preorder"),
        await dish(open, "available"),
        await dish(open, "available"),
        // «حسب الطلب» يظهر ولو كانت الأسرة لا تطبخ اليوم.
        await dish(resting, "preorder"),
      ];
      const notShown = [
        await dish(open, "unavailable"),
        await dish(open, "available", false),
        await dish(resting, "available"),
        await dish(hidden, "available"),
        await dish(stopped, "preorder"),
      ];
      const ours = async () =>
        (await todayProducts({ region: city.region_id }, 200))
          .map((p) => p.id)
          .filter((id) => shown.includes(id) || notShown.includes(id));
      const first = await ours();
      assert.deepEqual([...first].sort(), [...shown].sort());
      // ترتيب مختلف بين التحديثات (احتمال تطابق 10 مرات متتالية لسبعة أطباق ضئيل جدًا).
      const orders = new Set<string>();
      for (let i = 0; i < 10; i++) orders.add((await ours()).join(","));
      assert.ok(orders.size > 1, "الترتيب يتغير مع التحديث");
    } finally {
      await pool.query(
        "DELETE FROM jdatna.producer_cooking_days WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.products WHERE producer_id=ANY($1::uuid[])",
        [families],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [families],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
    }
  },
);
