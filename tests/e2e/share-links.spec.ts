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

  test("product page: share sits at the top as an expandable menu of apps, and the short link opens the product", async ({
    page,
    request,
  }) => {
    await page.goto(`/products/${product}`);
    const menu = page.locator(".page-top .share-menu");
    const toggle = menu.locator("summary");
    await expect(toggle).toHaveText("مشاركة");
    // مطوية حتى يُضغط عليها، ثم تتمدد بكل التطبيقات.
    await expect(menu.locator(".share-panel")).toBeHidden();
    await toggle.click();
    const apps = menu.getByRole("list", { name: "المشاركة عبر" });
    for (const app of [
      "مشاركة (صورة + رابط)",
      "واتساب",
      "تيليجرام",
      "فيسبوك",
      "تويتر / X",
      "سناب شات",
      "تيك توك",
      "إنستغرام",
      "نسخ الرابط",
      "رمز QR",
    ])
      await expect(apps.getByText(app).first()).toBeVisible();
    // رمز QR يظهر عند الضغط، وصورته من الخادم.
    await apps.getByRole("button", { name: "رمز QR" }).click();
    await expect(menu.getByAltText("رمز QR لرابط المشاركة")).toBeVisible();
    const link = menu.locator(".share-link");
    await expect(link).toHaveText(/^jdtna\.sa\/s\/[2-9a-zA-Z]{6}$/);
    const code = (await link.textContent())!.split("/s/")[1];
    const short = encodeURIComponent("https://jdtna.sa/s/" + code);
    await expect(apps.getByRole("link", { name: "واتساب" })).toHaveAttribute(
      "href",
      new RegExp("^https://wa\\.me/\\?text=.*" + short),
    );
    await expect(apps.getByRole("link", { name: "تيليجرام" })).toHaveAttribute(
      "href",
      new RegExp("^https://t\\.me/share/url\\?url=" + short),
    );
    // تنكمش بالضغط مرة أخرى.
    await toggle.click();
    await expect(menu.locator(".share-panel")).toBeHidden();
    // نفس الرمز في كل زيارة، ويحوّل إلى صفحة المنتج.
    await page.reload();
    await toggle.click();
    await expect(link).toHaveText("jdtna.sa/s/" + code);
    const res = await request.get(`/s/${code}`, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toBe(`https://jdtna.sa/products/${product}`);
    const qr = await request.get(`/s/${code}/qr`);
    expect(qr.headers()["content-type"]).toContain("image/svg+xml");
    expect(await qr.text()).toContain("<svg");
    expect((await request.get("/s/zzzzzz/qr")).status()).toBe(404);
    const missing = await request.get("/s/zzzzzz", { maxRedirects: 0 });
    expect(missing.headers().location).toBe("https://jdtna.sa/browse");
  });

  test("product page contact: chat always, WhatsApp and call only as the family chooses, no redirect button", async ({
    page,
  }) => {
    await page.goto(`/products/${product}`);
    const contact = page.locator(".contact-actions");
    // الزائر غير المسجّل: المحادثة تدعوه للتسجيل أولًا.
    await expect(
      contact.getByRole("link", { name: "سجّل لمراسلة الأسرة المنتجة" }),
    ).toBeVisible();
    await expect(
      contact.getByRole("link", { name: "تواصل عبر واتساب ↗" }),
    ).toHaveAttribute("href", /^https:\/\/wa\.me\/9665\d{8}\?text=/);
    await expect(
      contact.getByRole("link", { name: "اتصل بالأسرة المنتجة" }),
    ).toHaveAttribute("href", /^tel:\+9665\d{8}$/);
    await expect(
      page.getByRole("link", { name: /تواصل مع الأسرة المنتجة ←/ }),
    ).toHaveCount(0);
    // الأسرة تخفي الواتساب والجوال: تبقى المحادثة وحدها.
    await pool!.query(
      "UPDATE jdatna.producer_profiles SET show_phone=false,show_whatsapp=false WHERE id=$1",
      [fam],
    );
    await page.reload();
    // الزائر غير المسجّل: المحادثة تدعوه للتسجيل أولًا.
    await expect(
      contact.getByRole("link", { name: "سجّل لمراسلة الأسرة المنتجة" }),
    ).toBeVisible();
    await expect(contact.getByRole("link")).toHaveCount(1);
    await pool!.query(
      "UPDATE jdatna.producer_profiles SET show_phone=true,show_whatsapp=true WHERE id=$1",
      [fam],
    );
  });

  test("the family page shares all its products from the top with one short link", async ({
    page,
    request,
  }) => {
    await page.goto(`/producers/link-${fam}`);
    const menu = page.locator(".page-top .share-menu");
    await menu.locator("summary").click();
    const link = menu.locator(".share-link");
    await expect(link).toHaveText(/^jdtna\.sa\/s\/[2-9a-zA-Z]{6}$/);
    const code = (await link.textContent())!.split("/s/")[1];
    const res = await request.get(`/s/${code}`, { maxRedirects: 0 });
    expect(res.headers().location).toBe(
      `https://jdtna.sa/producers/link-${fam}`,
    );
  });
});
