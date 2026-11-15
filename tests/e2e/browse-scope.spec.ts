import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// «طبخات اليوم»: منتجات نطاق العميل أولًا، ثم ما يُشحن لكل المناطق، ولا يظهر غير المتاح له.
test.describe("today's dishes are scoped to the visitor's region", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const tag = randomUUID().slice(0, 6);
  const fam = [randomUUID(), randomUUID(), randomUUID()];
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const items = [randomUUID(), randomUUID(), randomUUID()];
  const dish = {
    local: "جريش المنطقة " + tag,
    kingdom: "تمر يُشحن للجميع " + tag,
    far: "مرقوق منطقة أخرى " + tag,
  };
  let pool: Pool | undefined,
    region = "",
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const [here, there] = (
      await pool.query(
        "SELECT DISTINCT ON (region_id) id,region_id FROM jdatna.cities ORDER BY region_id,id LIMIT 2",
      )
    ).rows;
    region = here.region_id;
    started = true;
    const plan: [number, string, string, string][] = [
      [0, here.id, dish.local, "coverage"],
      [1, there.id, dish.kingdom, "kingdom"],
      [2, there.id, dish.far, "coverage"],
    ];
    for (const [i, city, name, scope] of plan) {
      const phone =
        "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
        [users[i], "أسرة " + tag, phone],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
        [
          fam[i],
          users[i],
          "scope-" + fam[i],
          "أسرة " + i + " " + tag,
          city,
          phone,
        ],
      );
      // «طلب مسبق» حتى لا تتأثر اختبارات «مائدة اليوم» الفارغة.
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,delivery_scope) VALUES($1,$2,$3,'وصف',20,'صحن','preorder',$4)",
        [items[i], fam[i], name, scope],
      );
    }
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])",
          [items],
        );
        await pool.query(
          "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
          [fam],
        );
        await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
          users,
        ]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("region first, then nationwide shipping; other regions' local dishes hidden; search collapses", async ({
    page,
  }) => {
    await page.goto(`/browse?region=${encodeURIComponent(region)}`);
    const main = page.locator("main");
    const local = main.locator(".product-grid").first();
    await expect(
      local.getByRole("link", { name: new RegExp(dish.local) }),
    ).toBeVisible();
    const nationwide = page.getByRole("region", { name: "يُشحن لكل المناطق" });
    await expect(
      nationwide.getByRole("link", { name: new RegExp(dish.kingdom) }),
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: new RegExp(dish.far) }),
    ).toHaveCount(0);
    // البحث زر صغير مطوي، يتمدد عند الضغط.
    const search = page.locator("details.browse-search");
    await expect(search).not.toHaveAttribute("open", "");
    await expect(page.getByPlaceholder(/جريش، مرقوق/)).toBeHidden();
    await search.locator("summary").click();
    await expect(page.getByPlaceholder(/جريش، مرقوق/)).toBeVisible();
    // يُحفظ النطاق: فتح الصفحة دون منطقة في الرابط يبقى على نفس المنطقة.
    await page.getByLabel("منطقة المائدة").selectOption(region);
    await page.goto("/browse");
    await expect(page.getByLabel("منطقة المائدة")).toHaveValue(region);
    await expect(
      main.getByRole("link", { name: new RegExp(dish.far) }),
    ).toHaveCount(0);
    // «كل المناطق» يعرض الكل.
    await page.getByLabel("منطقة المائدة").selectOption("");
    await expect(
      main.getByRole("link", { name: new RegExp(dish.far) }),
    ).toBeVisible();
  });

  test("the home page, families page and offers follow the chosen region", async ({
    page,
  }) => {
    // الرئيسية: الأسر والمنتجات تتبع المنطقة.
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    const families = page.getByRole("region", { name: "الأسر المنتجة" });
    await expect(families).toContainText("أسرة 0 " + tag);
    await expect(families).toContainText("أسرة 1 " + tag);
    await expect(families).not.toContainText("أسرة 2 " + tag);
    // صفحة الأسر بنفس النطاق، والبعيدة المحلية لا تظهر.
    await page.goto(`/producers?region=${encodeURIComponent(region)}`);
    await expect(page.locator("main")).toContainText("أسرة 0 " + tag);
    await expect(
      page.getByRole("region", { name: "أسر تشحن لكل المناطق" }),
    ).toContainText("أسرة 1 " + tag);
    await expect(page.locator("main")).not.toContainText("أسرة 2 " + tag);
    // تغيير المنطقة في الرئيسية يغيّر العرض فعلًا.
    await page.goto("/");
    const other = await page
      .getByLabel("منطقة المائدة")
      .locator("option")
      .evaluateAll(
        (o, r) =>
          (o as HTMLOptionElement[])
            .map((x) => x.value)
            .find((v) => v && v !== r),
        region,
      );
    await page.getByLabel("منطقة المائدة").selectOption(other!);
    await expect(page).toHaveURL(new RegExp(`region=${other}`));
    await expect(
      page.getByRole("region", { name: "الأسر المنتجة" }),
    ).not.toContainText("أسرة 0 " + tag);
  });
});
