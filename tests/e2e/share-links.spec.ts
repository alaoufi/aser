import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// الرابط المختصر: يظهر في صفحة المنتج وصفحة الأسرة مع واتساب والنسخ، ويحوّل إلى الصفحة الأصلية.
test.describe("short share links for products and family pages", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  test.describe.configure({ mode: "serial" });
  const user = randomUUID(),
    fam = randomUUID(),
    product = randomUUID();
  let pool: Pool | undefined,
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    started = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة الرابط',$2,'producer',now())",
      [user, phone],
    );
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ الرابط',$4,$5,'approved')",
      [fam, user, "link-" + fam, city, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'قرصان الرابط','وصف',30,'صحن','preorder')",
      [product, fam],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.share_links WHERE target_id=ANY($1::uuid[])",
          [[product, fam]],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [product]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          fam,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [user]);
      }
    } finally {
      await pool?.end();
    }
  });

  test("the product page shows a short link with WhatsApp, and the link opens the product", async ({
    page,
    request,
  }) => {
    await page.goto(`/products/${product}`);
    const share = page.locator(".share-control").filter({
      hasText: "مشاركة المنتج",
    });
    const link = share.locator(".share-link");
    await expect(link).toHaveText(/^jdatna\.com\/s\/[2-9a-zA-Z]{6}$/);
    const code = (await link.textContent())!.split("/s/")[1];
    const whatsapp = share.getByRole("link", { name: "واتساب" });
    await expect(whatsapp).toHaveAttribute(
      "href",
      new RegExp(
        "^https://wa\\.me/\\?text=.*" +
          encodeURIComponent("https://jdatna.com/s/" + code),
      ),
    );
    await expect(
      share.getByRole("button", { name: "تيك توك وتطبيقات أخرى ↗" }),
    ).toBeVisible();
    // نفس الرمز في كل زيارة.
    await page.reload();
    await expect(link).toHaveText("jdatna.com/s/" + code);
    // الرابط المختصر يحوّل إلى صفحة المنتج.
    const res = await request.get(`/s/${code}`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe(
      `https://jdatna.com/products/${product}`,
    );
    // رمز غير موجود يحوّل إلى «طبخات اليوم».
    const missing = await request.get("/s/zzzzzz", { maxRedirects: 0 });
    expect(missing.headers().location).toBe("https://jdatna.com/browse");
  });

  test("the family page shares all its products with one short link", async ({
    page,
    request,
  }) => {
    await page.goto(`/producers/link-${fam}`);
    const share = page.locator(".share-control").filter({
      hasText: "مشاركة منتجات الأسرة",
    });
    const link = share.locator(".share-link");
    await expect(link).toHaveText(/^jdatna\.com\/s\/[2-9a-zA-Z]{6}$/);
    const code = (await link.textContent())!.split("/s/")[1];
    const res = await request.get(`/s/${code}`, { maxRedirects: 0 });
    expect(res.headers().location).toBe(
      `https://jdatna.com/producers/link-${fam}`,
    );
  });
});
