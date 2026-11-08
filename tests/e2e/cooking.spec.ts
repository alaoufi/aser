import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
test("family changes today's cooking state without editing profile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const user = {
    id: "cooking-browser-user",
    name: "أسرة الاختبار",
    phone: "+966500000001",
    role: "producer",
  };
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: false } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({
      json: {
        profile: {
          name: "أسرة الاختبار",
          phone: user.phone,
          status: "approved",
          categoryIds: ["12"],
          cityId: "riyadh",
          pickup: true,
        },
        categories: [],
        cities: [],
      },
    }),
  );
  let closed = false;
  let changes = 0;
  await page.route("**/api/producer/availability", (r) => {
    if (r.request().method() === "PUT") {
      closed = r.request().postDataJSON().notCookingToday;
      changes++;
    }
    return r.fulfill({ json: { day: "2026-11-08", notCookingToday: closed } });
  });
  await page.goto("/dashboard");
  const panel = page.getByRole("region", { name: "حالة الطبخ اليوم" });
  await expect(panel.getByRole("status")).toHaveText("الطبخ متاح اليوم");
  await panel
    .getByRole("button", { name: "لا يوجد طبخ اليوم", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText("لا يوجد طبخ اليوم");
  await panel.getByRole("button", { name: "إتاحة الطبخ اليوم" }).click();
  await expect(panel.getByRole("status")).toHaveText("الطبخ متاح اليوم");
  expect(changes).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test.describe("public cooking-day availability on an isolated catalog", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  const uid = randomUUID(),
    pid = randomUUID(),
    productId = randomUUID(),
    slug = `cooking-browser-${pid}`;
  let pool: Pool | undefined,
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      statement_timeout: 10000,
    });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    started = true;
    const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
      .rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'cooking-browser',$2,'producer',now())",
      [uid, `cooking-browser-${uid}`],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الطبخ للاختبار',$4,'+966500000001','approved')",
      [pid, uid, slug, city],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'فطور يوم الاختبار','fixture','وجبة','available')",
      [productId, pid],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_cooking_days(producer_id,day) VALUES($1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date)",
      [pid],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.producer_cooking_days WHERE producer_id=$1",
          [pid],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          pid,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [uid]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("public family stays published and order form offers tomorrow when today's cooking is off", async ({
    page,
  }) => {
    await page.route("**/api/session", (r) =>
      r.fulfill({ json: { user: null, registrationOpen: false } }),
    );
    await page.goto(`/producers/${slug}`);
    await expect(
      page
        .locator("main")
        .getByRole("heading", { name: "أسرة الطبخ للاختبار" }),
    ).toBeVisible();
    await expect(page.locator(".product-card .badge")).toHaveText(
      "لا يوجد طبخ اليوم",
    );
    await page.goto(`/products/${productId}`);
    await expect(
      page
        .locator("main")
        .getByText(
          "لا يوجد طبخ اليوم لدى هذه الأسرة. يمكنك طلب موعد يبدأ من الغد.",
        ),
    ).toBeVisible();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const tomorrow = new Date(
      new Date(today + "T00:00:00Z").getTime() + 86400000,
    )
      .toISOString()
      .slice(0, 10);
    await expect(page.getByLabel("تاريخ البداية")).toHaveAttribute(
      "min",
      tomorrow,
    );
    await expect(page.locator(".badge.inline")).toHaveText("متوفر");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
