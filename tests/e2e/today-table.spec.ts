import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test("today's table sits on the home page and says the dishes have not arrived when empty", async ({
  page,
}) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "مائدة اليوم" });
  await expect(table).toBeVisible();
  // بيئة الاختبار بلا أطباق متوفرة اليوم.
  await expect(table).toContainText("الطبخات لم تصل بعد");
  await expect(table.getByRole("link", { name: /افتح المائدة/ })).toHaveCount(
    0,
  );
  await page.goto("/table");
  await expect(page.getByRole("region", { name: "مائدة اليوم" })).toContainText(
    "الطبخات لم تصل بعد",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test.describe("today's table on a real isolated catalog", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    productId = randomUUID();
  const dish = "مرقوق مائدة اليوم " + productId.slice(0, 6);
  let pool: Pool | undefined,
    region = "",
    otherRegion = "",
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const name = (await pool.query("SELECT current_database() AS name")).rows[0]
      .name as string;
    expect(name.startsWith("jdatna_test_")).toBe(true);
    const city = (
      await pool.query(
        "SELECT c.id,c.region_id FROM jdatna.cities c ORDER BY c.id LIMIT 1",
      )
    ).rows[0];
    region = city.region_id;
    otherRegion = (
      await pool.query("SELECT id FROM jdatna.regions WHERE id<>$1 LIMIT 1", [
        region,
      ])
    ).rows[0].id;
    started = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة المائدة',$2,'producer',now())",
      [userId, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المائدة',$4,$5,'approved')",
      [producerId, userId, "table-" + producerId, city.id, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,$3,'طبق متوفر اليوم',20,'صحن','available')",
      [productId, producerId, dish],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("dishes available today show for the chosen region and open the bigger table", async ({
    page,
  }) => {
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    const table = page.getByRole("region", { name: "مائدة اليوم" });
    await expect(
      table.getByRole("link", { name: new RegExp(dish) }),
    ).toBeVisible();
    await table.getByRole("link", { name: /افتح المائدة كاملة/ }).click();
    await expect(page).toHaveURL(/\/table\?region=/);
    await expect(
      page.getByRole("link", { name: new RegExp(dish) }),
    ).toBeVisible();
    // منطقة أخرى: الطبق لا يظهر، ويُحفظ الاختيار في الجهاز.
    await page.getByLabel("منطقة المائدة").selectOption(otherRegion);
    await expect(page).toHaveURL(new RegExp(`region=${otherRegion}`));
    await expect(
      page.getByRole("link", { name: new RegExp(dish) }),
    ).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByLabel("منطقة المائدة")).toHaveValue(otherRegion);
  });
});
