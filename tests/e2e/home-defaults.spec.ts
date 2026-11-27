import { expect, test } from "@playwright/test";
const info = () => test.info();
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * قرار المالك 2026-11-26:
 * - كل دخول يبدأ بكل المناطق وكل الأسر، حتى لو سمح الزائر بموقعه أو اختار منطقة في زيارة سابقة.
 * - الاختيار اليدوي يبقى لتلك الزيارة فقط.
 */
test.describe("every visit starts with all regions", () => {
  test.use({
    geolocation: { latitude: 21.5433, longitude: 39.1728 },
    permissions: ["geolocation"],
  });
  test("location and an old saved region do not narrow the home page", async ({
    page,
    context,
    baseURL,
  }) => {
    // ملف المنطقة القديم (يبقى سنة) من زيارة سابقة: لا يُعتمد.
    await context.addCookies([
      { name: "jdatna_region", value: "riyadh", url: baseURL },
    ]);
    await page.goto("/");
    const picker = page.getByRole("combobox", { name: "منطقة المائدة" });
    await expect(picker).toHaveValue("");
    await expect(picker.locator("option:checked")).toHaveText("كل المناطق");
    // لا تحديد تلقائي من الموقع بعد التحميل.
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/region=/);
    await expect(picker).toHaveValue("");

    // يختار منطقة: تبقى في الزيارة نفسها.
    await picker.selectOption("makkah");
    await expect(page).toHaveURL(/region=makkah/);
    await page.goto("/");
    await expect(
      page.getByRole("combobox", { name: "منطقة المائدة" }),
    ).toHaveValue("makkah");
    // ملف الزيارة بلا مدة: يُمسح بإغلاق المتصفح.
    const cookie = (await context.cookies()).find(
      (c) => c.name === "jdatna_visit_region",
    );
    expect(cookie?.expires).toBe(-1);
  });
  test("a new visit starts again with all regions", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("combobox", { name: "منطقة المائدة" }),
    ).toHaveValue("");
  });
});

/** أرقام الحركة: أرقام فقط بلا أسماء ولا أسعار، ومطابقة لقاعدة الاختبار. */
test.describe("activity numbers", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const owner = randomUUID();
  const buyer = randomUUID();
  const family = randomUUID();
  const product = randomUUID();
  const slug = "e2e-activity-" + family;
  const familyName = `أسرة الأرقام ${family.slice(0, 5)}`;
  const productName = `كليجا الأرقام ${family.slice(0, 5)}`;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة',$2,'producer',now()),($3,'عميل',$4,'customer',now())",
      [owner, ph(), buyer, ph()],
    );
    const city = (
      await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
    ).rows[0].id;
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,'approved')",
      [family, owner, slug, familyName, city, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible,price,image_url) VALUES($1,$2,$3,'وصف','علبة','available',true,45,$4)",
      [product, family, productName, "/food/clay-pot-floating-v2.webp"],
    );
    for (const status of ["accepted", "completed", "declined"])
      await pool.query(
        "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date,current_date,$6)",
        [randomUUID(), randomUUID(), buyer, family, product, status],
      );
  });
  test.afterAll(async () => {
    await pool?.query(
      "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
      [family],
    );
    await pool?.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
      family,
    ]);
    await pool?.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
      family,
    ]);
    await pool?.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      [owner, buyer],
    ]);
    await pool?.end();
  });

  test("the home page ends with numbers only, matching the database", async ({
    page,
  }) => {
    await page.goto("/");
    const stats = page.getByRole("region", { name: "حركة المائدة" });
    await expect(stats).toBeVisible();
    await stats.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/activity-stats-${test.info().project.name}.png`,
    });
    const terms = stats.locator("dt");
    await expect(terms).toHaveText([
      "طلب منفّذ",
      "أسرة استقبلت طلبات",
      "منتج طُلب",
    ]);
    // أرقام فقط: لا أسماء أسر ولا منتجات ولا مبالغ.
    await expect(stats).not.toContainText(familyName);
    await expect(stats).not.toContainText("ر.س");
    const shown = (await stats.locator("dd").allTextContents()).map((t) =>
      Number(
        t
          .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
          .replace(/[^\d]/g, ""),
      ),
    );
    const db = (
      await pool!.query(
        `SELECT count(*)::int AS orders,count(DISTINCT o.producer_id)::int AS families,count(DISTINCT o.product_id)::int AS products
           FROM jdatna.order_requests o JOIN jdatna.producer_profiles p ON p.id=o.producer_id AND p.status='approved' AND NOT p.review_only
          WHERE o.status IN ('accepted','completed') AND o.request_hash<>'store-review'`,
      )
    ).rows[0];
    // اختبارات أخرى قد تضيف طلبات في الوقت نفسه: الرقم لا يقل عن طلبات هذه الأسرة.
    expect(shown[0]).toBeGreaterThanOrEqual(2);
    expect(shown[0]).toBeLessThanOrEqual(db.orders + 50);
    expect(shown[1]).toBeGreaterThanOrEqual(1);
    expect(shown[2]).toBeGreaterThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("the family's card and its product's card show their order numbers", async ({
    page,
  }) => {
    // المقبول والمكتمل فقط (المرفوض لا يُحسب): ٢.
    await page.goto(`/producers/${slug}`);
    const card = page.locator(".product-card", { hasText: productName });
    // شارة رقم على صورة المنتج (المقبول والمكتمل فقط).
    await expect(card.locator(".order-badge")).toContainText("٢");
    await expect(card.locator(".order-badge")).toContainText("طُلب ٢ مرة");
    await card.screenshot({
      path: `test-results/product-count-${test.info().project.name}.png`,
    });
    await page.goto(`/producers?q=${encodeURIComponent(familyName)}`);
    const familyCard = page.locator(".producer-card", { hasText: familyName });
    await expect(familyCard.locator(".order-count")).toHaveText("٢ طلب منفّذ");
    // عدد منتجاتها المعروضة رقمًا على البطاقة، وبلا شعار لا حروف بدله.
    await expect(familyCard.locator(".product-count-badge")).toHaveText(
      "١ منتج",
    );
    await expect(familyCard.locator(".producer-avatar")).toHaveCount(0);
    await familyCard.screenshot({
      path: `test-results/family-count-${test.info().project.name}.png`,
    });
  });

  test("the newest product is the first plate, and choosing it shows its details in the arch", async ({
    page,
  }) => {
    await page.goto("/");
    if (
      (await page.locator("html").getAttribute("data-template")) !== "classic"
    )
      test.skip();
    const plate = page.getByRole("button", { name: `اعرض ${productName}` });
    await expect(plate).toHaveCount(1);
    await plate.click();
    await expect(plate).toHaveAttribute("aria-pressed", "true");
    const caption = page.locator(".food-showcase-caption");
    await expect(caption).toContainText(productName);
    await expect(caption).toContainText(familyName);
    await expect(caption).toContainText("٤٥");
    await expect(
      caption.getByRole("link", { name: /التفاصيل/ }),
    ).toHaveAttribute("href", `/products/${product}`);
    await expect(plate.locator(".order-badge")).toHaveText("٢");
    // الضغط على الصحن المكبّر داخل القوس يفتح تفاصيل المنتج (طلب المالك 2026-11-27).
    await page
      .locator(".food-showcase-main")
      .click({ position: { x: 60, y: 60 } });
    await expect(page).toHaveURL(new RegExp(`/products/${product}$`));
    await page.goBack();
    // ثلاثة صفوف من أربعة حول القوس (رسم المالك 2026-11-27)، والأحدث رقم ١ أسفل اليسار.
    const ring = page.locator(".food-ring");
    for (const side of ["is-left", "is-top", "is-right"])
      await expect(ring.locator(`.food-ring-line.${side} button`)).toHaveCount(
        4,
      );
    const left = ring.locator(".food-ring-line.is-left button");
    const [first, second] = await Promise.all([
      left.nth(0).boundingBox(),
      left.nth(1).boundingBox(),
    ]);
    expect(first!.y).toBeGreaterThan(second!.y);
    const top = await ring.locator(".food-ring-line.is-top").boundingBox();
    const main = await ring.locator(".food-showcase-main").boundingBox();
    expect(first!.x).toBeLessThan(main!.x);
    expect(top!.y + top!.height).toBeLessThanOrEqual(main!.y + 1);
    await page.locator(".hero").screenshot({
      path: `test-results/hero-plates-${info().project.name}.png`,
    });
  });
});
