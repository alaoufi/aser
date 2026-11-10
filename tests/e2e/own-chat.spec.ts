import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test.describe("a family does not see «message the family» on its own pages", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    productId = randomUUID(),
    slug = "own-" + producerId.slice(0, 8);
  let pool: Pool | undefined;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
      .rows[0].id;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة نفسها',$2,'producer',now())",
      [userId, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ نفسه',$4,$5,'approved')",
      [producerId, userId, slug, city, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'طبق الأسرة','وصف',20,'صحن','available')",
      [productId, producerId],
    );
  });
  test.afterAll(async () => {
    try {
      await pool?.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool?.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        producerId,
      ]);
      await pool?.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
    } finally {
      await pool?.end();
    }
  });
  const as = async (page: Page, role: string, ownSlug: string | null) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("jdatna:family-welcome", "1");
      } catch {}
    });
    await page.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          user: {
            id: "u",
            name: "مستخدم",
            phone: "+966500000001",
            role,
            permissions: [],
          },
          registrationOpen: true,
        },
      }),
    );
    await page.route("**/api/producer/status", (r) =>
      r.fulfill({ json: { state: null, slug: ownSlug } }),
    );
  };

  test("the family owner sees no message button on its product and family pages", async ({
    page,
  }) => {
    await as(page, "producer", slug);
    await page.goto(`/products/${productId}`);
    await expect(
      page.getByRole("heading", { name: "طبق الأسرة", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "مراسلة الأسرة المنتجة" }),
    ).toHaveCount(0);
    await page.goto(`/producers/${slug}`);
    await expect(
      page.getByRole("button", { name: "مراسلة الأسرة المنتجة" }),
    ).toHaveCount(0);
  });

  test("another family or a member still sees it", async ({ page }) => {
    await as(page, "producer", "someone-else");
    await page.goto(`/products/${productId}`);
    await expect(
      page.getByRole("button", { name: "مراسلة الأسرة المنتجة" }),
    ).toBeVisible();
  });
});
